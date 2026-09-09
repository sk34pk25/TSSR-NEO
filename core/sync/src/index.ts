import type { PlayerProgress, SyncPayload } from '@tssr/contracts';
import { hashObject } from '@tssr/events';
import type { StorageAdapter } from '@tssr/storage';

/**
 * Synchronisation local-first.
 *
 * Rien n attend le reseau : toute action est appliquee localement, puis mise en
 * file. La file survit a la fermeture de l application. Si aucun fournisseur
 * n est configure, l ensemble reste parfaitement fonctionnel et la file attend.
 */

export type SyncStatus =
  'idle' | 'en-attente' | 'synchronisation' | 'hors-ligne' | 'erreur' | 'conflit';

export type OperationKind = 'upsert-progress' | 'upsert-snapshot' | 'delete-snapshot';

export interface SyncOperation {
  /** Cle d idempotence : rejouer la meme operation ne duplique rien. */
  id: string;
  kind: OperationKind;
  profileId: string;
  payload: unknown;
  /** Horloge logique locale au moment de la mise en file. */
  revision: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Empreinte du contenu : permet de detecter un doublon strict. */
  fingerprint: string;
}

export type PushResult =
  | { status: 'applied'; revision: number }
  | { status: 'duplicate'; revision: number }
  | { status: 'conflict'; remoteRevision: number; remote: PlayerProgress }
  | { status: 'retry'; reason: string }
  | { status: 'rejected'; reason: string };

export interface SyncProvider {
  readonly id: string;
  /** Un fournisseur indisponible ne fait jamais echouer l application. */
  isAvailable(): boolean;
  push(operation: SyncOperation): Promise<PushResult>;
  pull(profileId: string, sinceRevision: number): Promise<SyncPayload | undefined>;
}

const QUEUE_KEY = 'sync-queue';
const MAX_ATTEMPTS = 6;

/** Attente exponentielle plafonnee : on n inonde pas un service en difficulte. */
export function backoffMs(attempts: number): number {
  return Math.min(60000, 500 * 2 ** Math.max(0, attempts - 1));
}

export function makeOperation(
  kind: OperationKind,
  profileId: string,
  payload: unknown,
  revision: number,
  now: number,
): SyncOperation {
  const fingerprint = hashObject({ kind, profileId, payload });
  return {
    // La cle d idempotence derive du contenu : deux fois la meme intention
    // produit la meme cle, donc une seule application cote service.
    id: `${kind}:${profileId}:${fingerprint}`,
    kind,
    profileId,
    payload,
    revision,
    createdAt: now,
    attempts: 0,
    fingerprint,
  };
}

/** File d attente persistante : elle survit a la fermeture de l application. */
export class SyncQueue {
  private operations: SyncOperation[] = [];
  private readonly storage: StorageAdapter | undefined;

  constructor(storage?: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<void> {
    if (!this.storage) return;
    const stored = await this.storage.get<SyncOperation[]>('cache', QUEUE_KEY);
    if (Array.isArray(stored)) this.operations = stored;
  }

  private async persist(): Promise<void> {
    await this.storage?.put('cache', QUEUE_KEY, this.operations);
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    const existing = this.operations.findIndex((entry) => entry.id === operation.id);
    if (existing !== -1) {
      // Meme intention deja en file : on conserve la plus recente revision.
      const previous = this.operations[existing] as SyncOperation;
      this.operations[existing] = { ...operation, attempts: previous.attempts };
    } else {
      this.operations.push(operation);
    }
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.operations = this.operations.filter((entry) => entry.id !== id);
    await this.persist();
  }

  async update(operation: SyncOperation): Promise<void> {
    const index = this.operations.findIndex((entry) => entry.id === operation.id);
    if (index !== -1) this.operations[index] = operation;
    await this.persist();
  }

  list(): readonly SyncOperation[] {
    return this.operations;
  }

  size(): number {
    return this.operations.length;
  }

  async clear(): Promise<void> {
    this.operations = [];
    await this.persist();
  }
}

/**
 * Fusion de progression.
 *
 * Choix pedagogique assume : en cas de divergence entre deux appareils, on ne
 * perd jamais un acquis. On retient le maximum d experience, l union des badges,
 * et pour chaque competence la mesure la mieux etayee.
 */
export function mergeProgress(local: PlayerProgress, remote: PlayerProgress): PlayerProgress {
  const competencies = new Map(local.competencies.map((entry) => [entry.competencyId, entry]));
  for (const entry of remote.competencies) {
    const current = competencies.get(entry.competencyId);
    if (!current || entry.observations > current.observations) {
      competencies.set(entry.competencyId, entry);
    }
  }

  const missions = new Map(local.missions.map((entry) => [entry.missionId, entry]));
  for (const entry of remote.missions) {
    const current = missions.get(entry.missionId);
    if (!current) {
      missions.set(entry.missionId, entry);
      continue;
    }
    missions.set(entry.missionId, {
      ...current,
      attempts: Math.max(current.attempts, entry.attempts),
      completed: current.completed || entry.completed,
      lastPlayedAt: Math.max(current.lastPlayedAt, entry.lastPlayedAt),
      bestScore:
        (entry.bestScore?.overall ?? 0) > (current.bestScore?.overall ?? 0)
          ? entry.bestScore
          : current.bestScore,
      lastScore: current.lastPlayedAt >= entry.lastPlayedAt ? current.lastScore : entry.lastScore,
    });
  }

  const badges = new Map(local.badges.map((badge) => [badge.id, badge]));
  for (const badge of remote.badges) if (!badges.has(badge.id)) badges.set(badge.id, badge);

  return {
    ...local,
    xp: Math.max(local.xp, remote.xp),
    level: Math.max(local.level, remote.level),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    // Les preferences appartiennent a l appareil le plus recemment utilise.
    preferences: local.updatedAt >= remote.updatedAt ? local.preferences : remote.preferences,
    competencies: [...competencies.values()],
    missions: [...missions.values()],
    badges: [...badges.values()],
    offlineModules: [...new Set([...local.offlineModules, ...remote.offlineModules])],
  };
}

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncedAt?: number;
  lastError?: string;
  revision: number;
}

export interface SyncEngineOptions {
  provider?: SyncProvider;
  storage?: StorageAdapter;
  now?: () => number;
  /** Injecte pour les tests : evite d attendre reellement. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Machine a etats de synchronisation.
 * Elle ne bloque jamais l application : au pire la file grandit.
 */
export class SyncEngine {
  private readonly queue: SyncQueue;
  private provider: SyncProvider | undefined;
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;
  private state: SyncState = { status: 'idle', pending: 0, revision: 0 };
  private listeners = new Set<(state: SyncState) => void>();
  private running = false;
  /** Progression locale, source de verite tant que rien n est confirme. */
  private local: PlayerProgress | undefined;

  constructor(options: SyncEngineOptions = {}) {
    this.queue = new SyncQueue(options.storage);
    this.provider = options.provider;
    this.now = options.now ?? (() => Date.now());
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async init(): Promise<void> {
    await this.queue.load();
    this.emit({ pending: this.queue.size() });
  }

  setProvider(provider: SyncProvider | undefined): void {
    this.provider = provider;
    this.emit({});
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch, pending: patch.pending ?? this.queue.size() };
    for (const listener of this.listeners) listener(this.state);
  }

  getState(): SyncState {
    return this.state;
  }

  /** Enregistre une progression localement et met la synchronisation en file. */
  async recordProgress(progress: PlayerProgress): Promise<void> {
    this.local = progress;
    this.state.revision += 1;
    const operation = makeOperation(
      'upsert-progress',
      progress.profileId,
      progress,
      this.state.revision,
      this.now(),
    );
    await this.queue.enqueue(operation);
    this.emit({ status: this.provider?.isAvailable() === true ? 'en-attente' : 'hors-ligne' });
  }

  async enqueue(kind: OperationKind, profileId: string, payload: unknown): Promise<void> {
    this.state.revision += 1;
    await this.queue.enqueue(
      makeOperation(kind, profileId, payload, this.state.revision, this.now()),
    );
    this.emit({ status: this.provider?.isAvailable() === true ? 'en-attente' : 'hors-ligne' });
  }

  pending(): readonly SyncOperation[] {
    return this.queue.list();
  }

  /**
   * Vide la file.
   * Idempotent : rejouer une operation deja appliquee est sans effet.
   */
  async flush(): Promise<SyncState> {
    if (this.running) return this.state;
    const provider = this.provider;
    if (!provider || !provider.isAvailable()) {
      this.emit({ status: this.queue.size() > 0 ? 'hors-ligne' : 'idle' });
      return this.state;
    }

    this.running = true;
    this.emit({ status: 'synchronisation' });
    try {
      for (const operation of [...this.queue.list()]) {
        const result = await this.process(provider, operation);
        if (result === 'stop') break;
      }
      const remaining = this.queue.size();
      // Un abandon ou un conflit doit rester visible : l ecraser par un simple
      // « en attente » masquerait le fait qu une intervention est necessaire.
      const sticky = this.state.status === 'erreur' || this.state.status === 'conflit';
      this.emit({
        status: remaining === 0 ? 'idle' : sticky ? this.state.status : 'en-attente',
        ...(remaining === 0 ? { lastSyncedAt: this.now() } : {}),
      });
    } finally {
      this.running = false;
    }
    return this.state;
  }

  private async process(
    provider: SyncProvider,
    operation: SyncOperation,
  ): Promise<'continue' | 'stop'> {
    let result: PushResult;
    try {
      result = await provider.push(operation);
    } catch (error) {
      result = { status: 'retry', reason: String(error) };
    }

    if (result.status === 'applied' || result.status === 'duplicate') {
      await this.queue.remove(operation.id);
      this.emit({ revision: Math.max(this.state.revision, result.revision) });
      return 'continue';
    }

    if (result.status === 'conflict') {
      // Fusion sans perte, puis remise en file d une operation a jour.
      const merged = this.local ? mergeProgress(this.local, result.remote) : result.remote;
      this.local = merged;
      await this.queue.remove(operation.id);
      this.state.revision = result.remoteRevision + 1;
      await this.queue.enqueue(
        makeOperation(
          'upsert-progress',
          operation.profileId,
          merged,
          this.state.revision,
          this.now(),
        ),
      );
      this.emit({ status: 'conflit' });
      return 'continue';
    }

    if (result.status === 'rejected') {
      await this.queue.remove(operation.id);
      this.emit({ status: 'erreur', lastError: result.reason });
      return 'continue';
    }

    const attempts = operation.attempts + 1;
    await this.queue.update({ ...operation, attempts, lastError: result.reason });
    if (attempts >= MAX_ATTEMPTS) {
      this.emit({
        status: 'erreur',
        lastError: `abandon apres ${attempts} tentatives : ${result.reason}`,
      });
      return 'stop';
    }
    await this.wait(backoffMs(attempts));
    this.emit({ status: 'en-attente', lastError: result.reason });
    return 'stop';
  }

  /** Recupere l etat distant et le fusionne avec l etat local. */
  async pull(profileId: string): Promise<PlayerProgress | undefined> {
    const provider = this.provider;
    if (!provider || !provider.isAvailable()) return undefined;
    const payload = await provider.pull(profileId, this.state.revision);
    if (!payload) return undefined;
    const merged = this.local ? mergeProgress(this.local, payload.progress) : payload.progress;
    this.local = merged;
    this.emit({ revision: Math.max(this.state.revision, payload.revision) });
    return merged;
  }

  localProgress(): PlayerProgress | undefined {
    return this.local;
  }
}

/**
 * Fournisseur en memoire.
 * Il applique reellement les operations et respecte l idempotence : il sert de
 * reference de comportement, et permet de faire fonctionner la synchronisation
 * multi-onglets sur un meme appareil sans aucun service distant.
 */
export class InMemorySyncProvider implements SyncProvider {
  readonly id = 'memoire';
  private applied = new Set<string>();
  private store = new Map<string, { progress: PlayerProgress; revision: number }>();
  private available = true;

  setAvailable(available: boolean): void {
    this.available = available;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async push(operation: SyncOperation): Promise<PushResult> {
    if (this.applied.has(operation.id)) {
      const current = this.store.get(operation.profileId);
      return { status: 'duplicate', revision: current?.revision ?? operation.revision };
    }
    if (operation.kind !== 'upsert-progress') {
      this.applied.add(operation.id);
      return { status: 'applied', revision: operation.revision };
    }

    const current = this.store.get(operation.profileId);
    if (current && current.revision >= operation.revision) {
      return { status: 'conflict', remoteRevision: current.revision, remote: current.progress };
    }
    this.applied.add(operation.id);
    this.store.set(operation.profileId, {
      progress: operation.payload as PlayerProgress,
      revision: operation.revision,
    });
    return { status: 'applied', revision: operation.revision };
  }

  async pull(profileId: string): Promise<SyncPayload | undefined> {
    const current = this.store.get(profileId);
    if (!current) return undefined;
    return {
      schemaVersion: 1,
      coreVersion: '0.1.0',
      profileId,
      revision: current.revision,
      updatedAt: Date.now(),
      progress: current.progress,
      snapshots: [],
      deviceId: 'memoire',
    };
  }

  /** Utilise par les tests pour simuler l etat d un autre appareil. */
  seed(profileId: string, progress: PlayerProgress, revision: number): void {
    this.store.set(profileId, { progress, revision });
  }
}

export interface HttpProviderConfig {
  /** Racine du service de synchronisation. Sans elle, le fournisseur est inactif. */
  baseUrl?: string;
  /** Jeton public uniquement : aucune cle de service ne doit passer par le client. */
  token?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Fournisseur HTTP generique.
 *
 * Le code est reel et fonctionnel, mais **aucun service n est configure a ce
 * jour** : sans `baseUrl`, il se declare indisponible et la plateforme reste
 * entierement locale. Le contrat attendu est decrit dans docs/sync.md.
 */
export class HttpSyncProvider implements SyncProvider {
  readonly id = 'http';
  private readonly config: HttpProviderConfig;

  constructor(config: HttpProviderConfig = {}) {
    this.config = config;
  }

  isAvailable(): boolean {
    return typeof this.config.baseUrl === 'string' && this.config.baseUrl.length > 0;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.token !== undefined) headers.authorization = `Bearer ${this.config.token}`;
    return headers;
  }

  async push(operation: SyncOperation): Promise<PushResult> {
    if (!this.isAvailable()) return { status: 'retry', reason: 'aucun service configure' };
    const request = this.config.fetchImpl ?? fetch;
    const response = await request(`${this.config.baseUrl}/operations`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        // L en-tete d idempotence evite toute double application cote service.
        'idempotency-key': operation.id,
      },
      body: JSON.stringify(operation),
    });

    if (response.status === 409) {
      const body = (await response.json()) as { revision: number; progress: PlayerProgress };
      return { status: 'conflict', remoteRevision: body.revision, remote: body.progress };
    }
    if (response.status === 208) {
      const body = (await response.json()) as { revision: number };
      return { status: 'duplicate', revision: body.revision };
    }
    if (response.ok) {
      const body = (await response.json()) as { revision: number };
      return { status: 'applied', revision: body.revision };
    }
    if (response.status >= 500 || response.status === 429) {
      return { status: 'retry', reason: `service indisponible (${response.status})` };
    }
    return { status: 'rejected', reason: `refuse par le service (${response.status})` };
  }

  async pull(profileId: string, sinceRevision: number): Promise<SyncPayload | undefined> {
    if (!this.isAvailable()) return undefined;
    const request = this.config.fetchImpl ?? fetch;
    const response = await request(
      `${this.config.baseUrl}/state/${encodeURIComponent(profileId)}?since=${sinceRevision}`,
      { headers: this.headers() },
    );
    if (!response.ok) return undefined;
    return (await response.json()) as SyncPayload;
  }
}
