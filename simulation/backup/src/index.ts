import type { BackupJob, SystemState, WorldState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import { hashObject } from '@tssr/events';

export interface BackupRunResult {
  ok: boolean;
  pointId?: string;
  sizeGb?: number;
  error?: string;
}

export interface RestoreResult {
  ok: boolean;
  restoredSystems: string[];
  error?: string;
  /** Chaine de points utilisee : une incrementale exige toute sa lignee. */
  chain: string[];
}

interface StoredPayload {
  files: Record<string, SystemState['files']>;
  checksum: string;
}

/**
 * Sauvegarde et restauration pedagogiques.
 * Le contenu est reellement copie : une restauration remet l etat exact,
 * et une sauvegarde corrompue echoue vraiment.
 */
export class BackupEngine {
  private readonly world: WorldState;
  private readonly bus: EventBus | undefined;
  private readonly store = new Map<string, StoredPayload>();

  constructor(world: WorldState, options: { bus?: EventBus } = {}) {
    this.world = world;
    this.bus = options.bus;
  }

  private now(): number {
    return this.bus?.getSimTime() ?? this.world.simTime;
  }

  job(id: string): BackupJob | undefined {
    return this.world.backupJobs.find((j) => j.id === id || j.name === id);
  }

  run(jobId: string, kind?: BackupJob['kind']): BackupRunResult {
    const job = this.job(jobId);
    if (!job) return { ok: false, error: 'tache de sauvegarde introuvable' };
    if (!job.enabled) return { ok: false, error: 'la tache est desactivee' };

    const effectiveKind = kind ?? job.kind;
    const hasFull = job.points.some((p) => p.kind === 'full');
    if (effectiveKind !== 'full' && !hasFull) {
      return { ok: false, error: 'aucune sauvegarde complete de reference : une incrementale seule est inutilisable' };
    }

    const files: Record<string, SystemState['files']> = {};
    let bytes = 0;
    for (const systemId of job.sourceSystemIds) {
      const system = this.world.systems.find((s) => s.id === systemId);
      if (!system) continue;
      files[systemId] = structuredClone(system.files);
      for (const node of Object.values(system.files)) bytes += node.sizeBytes;
    }
    if (Object.keys(files).length === 0) {
      return { ok: false, error: 'aucune source valide : la tache ne sauvegarde rien' };
    }

    const pointId = `${job.id}-p${job.points.length + 1}`;
    const parent = job.points[job.points.length - 1]?.id;
    this.store.set(pointId, { files, checksum: hashObject(files) });
    job.points.push({
      id: pointId,
      takenAt: this.now(),
      kind: effectiveKind,
      sizeGb: Math.max(0.01, Math.round((bytes / 1_000_000_000) * 1000) / 1000),
      integrity: 'unverified',
      ...(effectiveKind === 'full' || parent === undefined ? {} : { parentId: parent }),
    });

    // La retention supprime les points les plus anciens, comme une vraie politique.
    while (job.points.length > job.retentionCount) {
      const removed = job.points.shift();
      if (removed) this.store.delete(removed.id);
    }

    this.bus?.emit({
      category: 'system',
      type: 'backup.completed',
      payload: { jobId: job.id, pointId, kind: effectiveKind },
      significant: true,
      label: `Sauvegarde ${effectiveKind} de ${job.name}`,
    });
    return { ok: true, pointId, sizeGb: job.points[job.points.length - 1]?.sizeGb ?? 0 };
  }

  /** Verification d integrite reelle : recalcul de l empreinte du contenu stocke. */
  verify(jobId: string, pointId: string): boolean {
    const job = this.job(jobId);
    const point = job?.points.find((p) => p.id === pointId);
    const payload = this.store.get(pointId);
    if (!job || !point) return false;
    if (!payload) {
      point.integrity = 'corrupted';
      return false;
    }
    const valid = hashObject(payload.files) === payload.checksum;
    point.integrity = valid ? 'verified' : 'corrupted';
    this.bus?.emit({
      category: 'system',
      type: 'backup.verified',
      payload: { jobId, pointId, valid },
      significant: true,
      label: `Verification ${pointId} : ${valid ? 'conforme' : 'corrompue'}`,
    });
    return valid;
  }

  /** Corruption controlee, utilisee par les scenarios de PRA. */
  corrupt(jobId: string, pointId: string): boolean {
    const job = this.job(jobId);
    const point = job?.points.find((p) => p.id === pointId);
    if (!point) return false;
    point.integrity = 'corrupted';
    this.store.delete(pointId);
    return true;
  }

  restore(jobId: string, pointId: string): RestoreResult {
    const job = this.job(jobId);
    if (!job) return { ok: false, restoredSystems: [], chain: [], error: 'tache introuvable' };
    const point = job.points.find((p) => p.id === pointId);
    if (!point) return { ok: false, restoredSystems: [], chain: [], error: 'point de restauration introuvable' };

    // Reconstitution de la lignee : incrementale -> parent -> ... -> complete.
    const chain: string[] = [];
    let cursor = point;
    for (;;) {
      chain.unshift(cursor.id);
      if (cursor.kind === 'full' || cursor.parentId === undefined) break;
      const parent = job.points.find((p) => p.id === cursor.parentId);
      if (!parent) {
        return {
          ok: false,
          restoredSystems: [],
          chain,
          error: 'chaine incomplete : un point parent a ete supprime par la retention',
        };
      }
      cursor = parent;
    }

    for (const id of chain) {
      const stored = this.store.get(id);
      const meta = job.points.find((p) => p.id === id);
      if (!stored || meta?.integrity === 'corrupted') {
        return { ok: false, restoredSystems: [], chain, error: `point ${id} corrompu ou illisible` };
      }
    }

    const restored: string[] = [];
    for (const id of chain) {
      const stored = this.store.get(id);
      if (!stored) continue;
      for (const [systemId, files] of Object.entries(stored.files)) {
        const system = this.world.systems.find((s) => s.id === systemId);
        if (!system) continue;
        system.files = structuredClone(files);
        if (!restored.includes(systemId)) restored.push(systemId);
      }
    }

    this.bus?.emit({
      category: 'system',
      type: 'backup.restored',
      payload: { jobId, pointId, systems: restored },
      significant: true,
      label: `Restauration de ${job.name} depuis ${pointId}`,
    });
    return { ok: true, restoredSystems: restored, chain };
  }

  /** Test de restauration sans impact : valide la sauvegarde, pas le systeme de production. */
  testRestore(jobId: string, pointId: string): { ok: boolean; error?: string } {
    const job = this.job(jobId);
    if (!job) return { ok: false, error: 'tache introuvable' };
    const valid = this.verify(jobId, pointId);
    if (valid) job.lastRestoreTestAt = this.now();
    return valid ? { ok: true } : { ok: false, error: 'la sauvegarde ne passe pas le controle d integrite' };
  }

  /** Perte de donnees maximale au moment donne, en minutes de temps simule. */
  currentRpoMinutes(jobId: string): number | undefined {
    const job = this.job(jobId);
    const last = job?.points[job.points.length - 1];
    if (!job || !last) return undefined;
    return Math.max(0, Math.round((this.now() - last.takenAt) / 60000));
  }
}
