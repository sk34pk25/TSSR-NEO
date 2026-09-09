import type { PlayerProgress, SaveState, Snapshot, UserExport, WorldState } from '@tssr/contracts';
import { safeParseContract, zPlayerProgress, zSaveState, zSnapshot, zUserExport } from '@tssr/contracts';
import { hashObject, stableStringify } from '@tssr/events';
import type { StorageAdapter } from './adapter.ts';
import { EVICTION_ORDER } from './adapter.ts';

const SESSION_MARKER = 'session-open';
const AUTOSAVE_ID = 'autosave';

export interface SaveEnvelope {
  save: SaveState;
  /** Vrai si l empreinte enregistree correspond au contenu relu. */
  intact: boolean;
}

function computeIntegrity(save: Omit<SaveState, 'integrity'>): string {
  return hashObject(save);
}

/** Prepare une sauvegarde en calculant son empreinte d integrite. */
export function sealSave(save: Omit<SaveState, 'integrity'>): SaveState {
  return { ...save, integrity: computeIntegrity(save) };
}

export function verifySave(save: SaveState): boolean {
  const { integrity, ...rest } = save;
  return computeIntegrity(rest) === integrity;
}

export interface StorageReport {
  totalBytes: number;
  byStore: Record<string, number>;
  /** Ce qui peut etre libere sans perdre de progression. */
  reclaimableBytes: number;
}

/**
 * Gestion des sauvegardes, instantanes et reprise apres arret anormal.
 * La progression du joueur est la donnee la plus protegee : elle n est jamais purgee.
 */
export class SaveManager {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // ------------------------------------------------------------- sauvegardes

  async write(save: SaveState): Promise<void> {
    await this.storage.put('saves', save.id, save);
  }

  async read(id: string): Promise<SaveEnvelope | undefined> {
    const raw = await this.storage.get<unknown>('saves', id);
    if (raw === undefined) return undefined;
    const parsed = safeParseContract(zSaveState, raw);
    if (!parsed.ok) return undefined;
    return { save: parsed.value, intact: verifySave(parsed.value) };
  }

  async listSaves(): Promise<string[]> {
    return this.storage.keys('saves');
  }

  async autosave(world: WorldState, base: Omit<SaveState, 'id' | 'integrity' | 'world'>): Promise<SaveState> {
    const save = sealSave({ ...base, id: AUTOSAVE_ID, world });
    await this.write(save);
    return save;
  }

  // -------------------------------------------------------------- instantanes

  async takeSnapshot(snapshot: Snapshot): Promise<void> {
    await this.storage.put('snapshots', snapshot.id, snapshot);
  }

  async getSnapshot(id: string): Promise<Snapshot | undefined> {
    const raw = await this.storage.get<unknown>('snapshots', id);
    if (raw === undefined) return undefined;
    const parsed = safeParseContract(zSnapshot, raw);
    return parsed.ok ? parsed.value : undefined;
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const keys = await this.storage.keys('snapshots');
    const result: Snapshot[] = [];
    for (const key of keys) {
      const snapshot = await this.getSnapshot(key);
      if (snapshot) result.push(snapshot);
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.storage.delete('snapshots', id);
  }

  /** Compare deux instantanes et resume ce qui a change dans le monde simule. */
  async compareSnapshots(aId: string, bId: string): Promise<string[]> {
    const a = await this.getSnapshot(aId);
    const b = await this.getSnapshot(bId);
    if (!a || !b) return ['instantane introuvable'];
    return diffWorlds(a.save.world, b.save.world);
  }

  // ------------------------------------------------------------- progression

  async saveProgress(progress: PlayerProgress): Promise<void> {
    await this.storage.put('progress', progress.profileId, progress);
  }

  async loadProgress(profileId: string): Promise<PlayerProgress | undefined> {
    const raw = await this.storage.get<unknown>('progress', profileId);
    if (raw === undefined) return undefined;
    const parsed = safeParseContract(zPlayerProgress, raw);
    return parsed.ok ? parsed.value : undefined;
  }

  // ------------------------------------------------- reprise apres incident

  async markSessionOpen(): Promise<void> {
    await this.storage.put('cache', SESSION_MARKER, { at: Date.now() });
  }

  async markSessionClosed(): Promise<void> {
    await this.storage.delete('cache', SESSION_MARKER);
  }

  /** Un marqueur encore present au demarrage signale un arret anormal. */
  async detectUncleanShutdown(): Promise<boolean> {
    return (await this.storage.get('cache', SESSION_MARKER)) !== undefined;
  }

  /**
   * Cherche l etat coherent le plus recent : sauvegarde automatique si elle est
   * intacte, sinon le dernier point de controle sain.
   */
  async findRecoveryPoint(): Promise<{ source: 'autosave' | 'checkpoint' | 'none'; save?: SaveState }> {
    const autosave = await this.read(AUTOSAVE_ID);
    if (autosave?.intact === true) return { source: 'autosave', save: autosave.save };
    const snapshots = await this.listSnapshots();
    for (const snapshot of snapshots) {
      if (verifySave(snapshot.save)) return { source: 'checkpoint', save: snapshot.save };
    }
    return { source: 'none' };
  }

  // ------------------------------------------------------------- maintenance

  async report(): Promise<StorageReport> {
    const usage = await this.storage.usage();
    const byStore = usage as Record<string, number>;
    const totalBytes = Object.values(byStore).reduce((sum, value) => sum + value, 0);
    const reclaimableBytes = (byStore.cache ?? 0) + (byStore.modules ?? 0);
    return { totalBytes, byStore, reclaimableBytes };
  }

  /** Libere de la place en respectant l ordre de purge : la progression est intouchable. */
  async reclaim(targetBytes: number): Promise<{ freed: number; cleared: string[] }> {
    let freed = 0;
    const cleared: string[] = [];
    for (const store of EVICTION_ORDER) {
      if (store === 'progress' || store === 'saves') continue;
      if (freed >= targetBytes) break;
      const usage = await this.storage.usage();
      const size = usage[store] ?? 0;
      if (size === 0) continue;
      await this.storage.clear(store);
      freed += size;
      cleared.push(store);
    }
    return { freed, cleared };
  }

  // --------------------------------------------------------- export / import

  buildExport(progress: PlayerProgress, snapshots: Snapshot[], coreVersion: string): UserExport {
    const payload = {
      format: 'tssr-neo-export' as const,
      schemaVersion: 1 as const,
      exportedAt: Date.now(),
      coreVersion,
      progress,
      preferences: progress.preferences,
      snapshots,
      labs: [],
    };
    return { ...payload, integrity: hashObject(payload) };
  }

  /** Import strictement valide : un fichier altere est refuse avec une raison lisible. */
  importExport(raw: unknown): { ok: true; value: UserExport } | { ok: false; reason: string } {
    const parsed = safeParseContract(zUserExport, raw);
    if (!parsed.ok) {
      return { ok: false, reason: `format invalide : ${parsed.issues.map((i) => i.path).join(', ')}` };
    }
    const { integrity, ...rest } = parsed.value;
    if (hashObject(rest) !== integrity) {
      return { ok: false, reason: 'controle d integrite en echec : le fichier a ete modifie' };
    }
    return { ok: true, value: parsed.value };
  }
}

/** Differences lisibles entre deux etats du monde, pour la comparaison d instantanes. */
export function diffWorlds(a: WorldState, b: WorldState): string[] {
  const changes: string[] = [];
  const nodesA = new Map(a.network.nodes.map((n) => [n.id, n]));
  for (const node of b.network.nodes) {
    const before = nodesA.get(node.id);
    if (!before) {
      changes.push(`equipement ajoute : ${node.hostname}`);
      continue;
    }
    if (before.powered !== node.powered) {
      changes.push(`${node.hostname} : alimentation ${node.powered ? 'retablie' : 'coupee'}`);
    }
    for (const iface of node.interfaces) {
      const prev = before.interfaces.find((i) => i.id === iface.id);
      if (!prev) continue;
      if (stableStringify(prev.addresses) !== stableStringify(iface.addresses)) {
        changes.push(
          `${node.hostname}/${iface.name} : adressage ${prev.addresses.map((x) => x.address).join(',') || 'aucun'} -> ${iface.addresses.map((x) => x.address).join(',') || 'aucun'}`,
        );
      }
      if (prev.accessVlan !== iface.accessVlan) {
        changes.push(`${node.hostname}/${iface.name} : VLAN ${prev.accessVlan ?? '-'} -> ${iface.accessVlan ?? '-'}`);
      }
      if (prev.enabled !== iface.enabled) {
        changes.push(`${node.hostname}/${iface.name} : ${iface.enabled ? 'activee' : 'desactivee'}`);
      }
    }
    for (const service of node.services) {
      const prev = before.services.find((s) => s.id === service.id);
      if (prev && prev.status !== service.status) {
        changes.push(`${node.hostname} : service ${service.name} ${prev.status} -> ${service.status}`);
      }
    }
  }
  const ticketsA = new Map(a.tickets.map((t) => [t.id, t]));
  for (const ticket of b.tickets) {
    const before = ticketsA.get(ticket.id);
    if (before && before.status !== ticket.status) {
      changes.push(`ticket ${ticket.reference} : ${before.status} -> ${ticket.status}`);
    }
  }
  return changes;
}
