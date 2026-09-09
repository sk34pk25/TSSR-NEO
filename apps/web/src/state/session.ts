import type {
  DifficultyMode,
  MissionDefinition,
  PlayerProgress,
  Preferences,
  Role,
  SaveState,
  Snapshot,
} from '@tssr/contracts';
import { EventBus, Rng, hashObject } from '@tssr/events';
import {
  MemoryStorageAdapter,
  SaveManager,
  createStorage,
  sealSave,
  type StorageAdapter,
} from '@tssr/storage';
import { applyMissionResult, createProfile, suggestDifficulty } from '@tssr/progression';
import { KnowledgeLibrary } from '@tssr/knowledge';
import { MissionRunner, ScenarioRegistry, applyVariant, pickVariant } from '@tssr/mission-engine';
import { SimulationWorld } from '@tssr/sim-world';
import { Nova } from '@tssr/nova';
import {
  detectCapabilities,
  resolveProfile,
  type QualityProfile,
  type RenderCapabilities,
} from '@tssr/rendering';
import { AudioEngine, EVENT_CUES, type AudioStatus } from '@tssr/audio';
import {
  PolicyEngine,
  claimAdmin,
  createBootstrapState,
  type BootstrapState,
  type Permission,
  type Resource,
  type Subject,
} from '@tssr/permissions';
import { HttpSyncProvider, SyncEngine, type SyncState } from '@tssr/sync';
import {
  missionPosteSansReseau,
  trainingLabCompetencies,
  trainingLabCourse,
  trainingLabKnowledge,
  trainingLabManifest,
  trainingLabScenario,
} from '@tssr/module-training-lab';

export const CORE_VERSION = '0.1.0';
const PROFILE_ID = 'local';

export interface RecoveryOffer {
  source: 'autosave' | 'checkpoint';
  save: SaveState;
}

export type SessionListener = () => void;

/**
 * Etat applicatif de la session.
 * Local-first : tout fonctionne sans compte ni service distant.
 */
export class AppSession {
  private listeners = new Set<SessionListener>();
  private storage: StorageAdapter = new MemoryStorageAdapter();
  saveManager = new SaveManager(this.storage);
  readonly library = new KnowledgeLibrary();
  readonly registry = new ScenarioRegistry();
  readonly modules = [trainingLabManifest];
  readonly courses = [trainingLabCourse];
  readonly missions: MissionDefinition[] = [missionPosteSansReseau];

  progress: PlayerProgress = createProfile(PROFILE_ID);
  world: SimulationWorld | undefined;
  runner: MissionRunner | undefined;
  nova: Nova | undefined;
  capabilities: RenderCapabilities = {
    webgpu: false,
    webgl2: false,
    webgl1: false,
    cores: undefined,
    deviceMemoryGb: undefined,
    maxTextureSize: undefined,
    devicePixelRatio: 1,
    prefersReducedMotion: false,
    touch: false,
    offscreenCanvas: false,
    rendererName: undefined,
  };
  profile: QualityProfile = resolveProfile('performance', this.capabilities);
  storageMode: 'indexeddb' | 'memory' = 'memory';
  recovery: RecoveryOffer | undefined;
  booted = false;

  /** Role local. Sans service distant, il vaut « invite » puis « apprenant ». */
  role: Role = 'student';
  readonly policy = new PolicyEngine();
  bootstrap: BootstrapState = createBootstrapState();

  readonly audio = new AudioEngine();
  audioStatus: AudioStatus = 'inactif';

  /**
   * Synchronisation : la file fonctionne toujours, le fournisseur non.
   * Aucun service n est configure a ce jour, ce que l interface indique.
   */
  readonly sync = new SyncEngine({ provider: new HttpSyncProvider() });
  syncState: SyncState = { status: 'idle', pending: 0, revision: 0 };
  snapshots: Snapshot[] = [];
  lastSavedAt: number | undefined;

  constructor() {
    this.registry.register(trainingLabScenario);
    this.library
      .addEntries(trainingLabKnowledge)
      .addCompetencies(trainingLabCompetencies)
      .addMissions(this.missions);
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  async boot(): Promise<void> {
    this.storage = await createStorage();
    this.storageMode = this.storage instanceof MemoryStorageAdapter ? 'memory' : 'indexeddb';
    this.saveManager = new SaveManager(this.storage);

    const stored = await this.saveManager.loadProgress(PROFILE_ID);
    if (stored) this.progress = stored;

    this.capabilities = detectCapabilities();
    this.applyPreferences();

    // Un marqueur de session encore present signale un arret anormal.
    if (await this.saveManager.detectUncleanShutdown()) {
      const point = await this.saveManager.findRecoveryPoint();
      if (point.save)
        this.recovery = { source: point.source as 'autosave' | 'checkpoint', save: point.save };
    }
    await this.saveManager.markSessionOpen();
    this.snapshots = await this.saveManager.listSnapshots();

    await this.sync.init();
    this.sync.subscribe((state) => {
      this.syncState = state;
      this.notify();
    });
    this.audio.subscribe((status) => {
      this.audioStatus = status;
      this.notify();
    });
    this.audio.setLevels(this.progress.preferences.audio);

    this.booted = true;
    this.notify();
  }

  /** Sujet courant pour les decisions d autorisation. */
  subject(): Subject {
    return { role: this.role, profileId: this.progress.profileId };
  }

  can(permission: Permission, resource?: Resource): boolean {
    return this.policy.can(this.subject(), permission, resource).allowed;
  }

  whyNot(permission: Permission, resource?: Resource): string {
    return this.policy.can(this.subject(), permission, resource).reason;
  }

  setRole(role: Role): void {
    this.role = role;
    this.notify();
  }

  /** Prise de controle initiale : elle se verrouille apres un seul usage. */
  claimAdministrator(): { allowed: boolean; reason: string } {
    const result = claimAdmin(this.bootstrap, this.progress.profileId, Date.now());
    this.bootstrap = result.state;
    if (result.decision.allowed) this.role = 'admin';
    this.notify();
    return { allowed: result.decision.allowed, reason: result.decision.reason };
  }

  /**
   * Active le son.
   * Doit etre appele depuis un geste utilisateur : les navigateurs refusent
   * de produire du son autrement, et nous le signalons plutot que de le masquer.
   */
  async enableAudio(): Promise<AudioStatus> {
    const status = await this.audio.resume();
    this.audio.setLevels(this.progress.preferences.audio);
    if (status === 'actif') this.audio.startAmbience();
    return status;
  }

  /** Relie les evenements de simulation aux retours sonores. */
  private attachAudio(world: SimulationWorld): void {
    world.bus.onAny((entry) => {
      const cue = EVENT_CUES[entry.type];
      if (cue !== undefined) this.audio.play(cue);
    });
  }

  /** Applique les preferences a la racine du document (accessibilite comprise). */
  applyPreferences(): void {
    const prefs = this.progress.preferences;
    this.profile = resolveProfile(prefs.graphicsQuality, this.capabilities);
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const scale = { s: 0.9, m: 1, l: 1.15, xl: 1.3 }[prefs.accessibility.textSize];
    root.style.setProperty('--neo-text-scale', String(scale));
    root.style.setProperty('zoom', String(prefs.accessibility.uiScale));
    root.dataset.contrast = prefs.accessibility.contrast;
    root.dataset.colorblind = prefs.accessibility.colorBlindMode;
    root.dataset.reduceMotion = String(
      prefs.accessibility.reduceMotion || this.capabilities.prefersReducedMotion,
    );
    root.dataset.reduceComplexity = String(prefs.accessibility.reduceVisualComplexity);
    root.lang = prefs.locale;
  }

  async updatePreferences(patch: Partial<Preferences>): Promise<void> {
    this.progress = {
      ...this.progress,
      preferences: { ...this.progress.preferences, ...patch },
      updatedAt: Date.now(),
    };
    this.applyPreferences();
    this.audio.setLevels(this.progress.preferences.audio);
    await this.saveManager.saveProgress(this.progress);
    this.nova?.setProgress(this.progress);
    this.notify();
  }

  mission(id: string): MissionDefinition | undefined {
    return this.missions.find((m) => m.id === id);
  }

  /** Demarre une mission : scenario neuf, variante reproductible, monde deterministe. */
  startMission(
    missionId: string,
    options: { difficulty?: DifficultyMode; seed?: number } = {},
  ): boolean {
    const base = this.mission(missionId);
    if (!base) return false;
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    const rng = new Rng(seed);
    const variant = pickVariant(base, rng);
    const definition = applyVariant(base, variant);
    const state = this.registry.build(definition.scenarioId, {
      seed,
      params: variant?.parameters ?? {},
    });
    const bus = new EventBus();
    const world = new SimulationWorld(state, { bus, seed });
    const requested = options.difficulty ?? this.progress.preferences.difficulty;
    const difficulty: DifficultyMode =
      requested === 'adaptive'
        ? suggestDifficulty(this.progress, definition.competencies)
        : requested;
    const runner = new MissionRunner(definition, world, {
      seed,
      difficulty,
      ...(variant === undefined ? {} : { variantId: variant.id }),
    });
    runner.start();
    this.world = world;
    this.runner = runner;
    this.attachAudio(world);
    this.nova = new Nova({
      library: this.library,
      world,
      runner,
      progress: this.progress,
      verbosity: this.progress.preferences.novaVerbosity,
    });
    this.notify();
    void this.autosave();
    return true;
  }

  /** Laboratoire libre : meme moteur, sans objectifs imposes. */
  startFreeLab(scenarioId = trainingLabScenario.id, seed = 1): void {
    const state = this.registry.build(scenarioId, { seed, params: {} });
    const bus = new EventBus();
    const world = new SimulationWorld(state, { bus, seed });
    this.world = world;
    this.runner = undefined;
    this.attachAudio(world);
    this.nova = new Nova({
      library: this.library,
      world,
      progress: this.progress,
      verbosity: this.progress.preferences.novaVerbosity,
    });
    this.notify();
  }

  /** Reevalue la mission apres toute action ayant pu changer l etat du monde. */
  tick(): void {
    if (this.runner && this.runner.state.status === 'active') this.runner.tick();
    this.world?.monitoring.runAll();
    this.notify();
    void this.autosave();
  }

  advanceTime(minutes: number): void {
    this.world?.advance(minutes * 60000);
    this.tick();
  }

  private buildSave(id: string): SaveState | undefined {
    const world = this.world;
    if (!world) return undefined;
    const now = Date.now();
    return sealSave({
      schemaVersion: 1,
      id,
      coreVersion: CORE_VERSION,
      createdAt: now,
      updatedAt: now,
      seed: world.state.seed,
      world: world.snapshotState(),
      ...(this.runner === undefined ? {} : { mission: structuredClone(this.runner.state) }),
      eventLog: world.bus.toLog(),
      presence: { area: 'lobby', position: [0, 0, 0], rotationY: 0, cameraMode: 'third-person' },
    });
  }

  async autosave(): Promise<void> {
    const save = this.buildSave('autosave');
    if (!save) return;
    await this.saveManager.write(save);
    await this.saveManager.saveProgress(this.progress);
    this.lastSavedAt = save.updatedAt;
    this.notify();
  }

  async takeSnapshot(
    name: string,
    kind: Snapshot['kind'] = 'manual',
  ): Promise<Snapshot | undefined> {
    const save = this.buildSave(`snap-${Date.now()}`);
    if (!save) return undefined;
    const snapshot: Snapshot = {
      schemaVersion: 1,
      id: save.id,
      name,
      kind,
      createdAt: save.createdAt,
      saveId: save.id,
      save,
    };
    await this.saveManager.takeSnapshot(snapshot);
    this.snapshots = await this.saveManager.listSnapshots();
    this.notify();
    return snapshot;
  }

  /** Restaure un etat exact : le monde et la mission repartent a l identique. */
  restore(save: SaveState): void {
    const bus = new EventBus({ log: save.eventLog });
    const world = new SimulationWorld(save.world, { bus, seed: save.seed });
    this.world = world;
    if (save.mission) {
      const definition = this.mission(save.mission.missionId);
      if (definition) {
        const runner = new MissionRunner(definition, world, {
          seed: save.seed,
          difficulty: save.mission.difficulty,
        });
        Object.assign(runner.state, save.mission);
        this.runner = runner;
      }
    } else {
      this.runner = undefined;
    }
    this.nova = new Nova({
      library: this.library,
      world,
      ...(this.runner === undefined ? {} : { runner: this.runner }),
      progress: this.progress,
      verbosity: this.progress.preferences.novaVerbosity,
    });
    this.recovery = undefined;
    this.notify();
  }

  async restoreSnapshot(id: string): Promise<boolean> {
    const snapshot = await this.saveManager.getSnapshot(id);
    if (!snapshot) return false;
    this.restore(snapshot.save);
    return true;
  }

  async dismissRecovery(): Promise<void> {
    this.recovery = undefined;
    await this.saveManager.markSessionClosed();
    await this.saveManager.markSessionOpen();
    this.notify();
  }

  /** Cloture de mission : progression, badges et maitrise sont mis a jour. */
  async completeMission(): Promise<ReturnType<typeof applyMissionResult> | undefined> {
    const runner = this.runner;
    if (!runner) return undefined;
    const score = runner.score();
    const result = applyMissionResult(this.progress, runner.definition, score);
    this.progress = result.progress;
    await this.saveManager.saveProgress(this.progress);
    await this.sync.recordProgress(this.progress);
    void this.sync.flush();
    this.nova?.setProgress(this.progress);
    this.notify();
    return result;
  }

  async exportProfile(): Promise<string> {
    const payload = this.saveManager.buildExport(this.progress, this.snapshots, CORE_VERSION);
    return JSON.stringify(payload, null, 2);
  }

  async importProfile(raw: string): Promise<{ ok: boolean; message: string }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: 'Fichier illisible : ce n est pas du JSON valide.' };
    }
    const result = this.saveManager.importExport(parsed);
    if (!result.ok) return { ok: false, message: result.reason };
    this.progress = result.value.progress;
    await this.saveManager.saveProgress(this.progress);
    for (const snapshot of result.value.snapshots) await this.saveManager.takeSnapshot(snapshot);
    this.snapshots = await this.saveManager.listSnapshots();
    this.applyPreferences();
    this.notify();
    return { ok: true, message: 'Progression importee.' };
  }

  async storageReport() {
    return this.saveManager.report();
  }

  async shutdown(): Promise<void> {
    await this.autosave();
    await this.saveManager.markSessionClosed();
  }

  /** Empreinte de l etat courant : utilisee par les diagnostics. */
  worldFingerprint(): string {
    return this.world ? hashObject(this.world.state).slice(0, 12) : 'aucun monde charge';
  }
}

export const session = new AppSession();
