import type { DeploymentJob, DeploymentTemplate, SystemState, WorldState } from '@tssr/contracts';
import type { EventBus, Rng } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';
import { createSystem } from '@tssr/sim-systems';

export interface DeploymentOutcome {
  jobId: string;
  succeeded: string[];
  failed: { assetId: string; reason: string }[];
}

/**
 * Deploiement de masse : chaque cible recoit reellement un systeme,
 * un nom, une configuration reseau et, si demande, une jonction au domaine.
 * Les echecs sont journalises et le retour arriere supprime ce qui a ete cree.
 */
export class DeploymentEngine {
  private readonly world: WorldState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;
  private readonly rng: Rng | undefined;
  private readonly created = new Map<string, string[]>();

  constructor(world: WorldState, deps: { network: NetworkEngine; bus?: EventBus; rng?: Rng }) {
    this.world = world;
    this.network = deps.network;
    this.bus = deps.bus;
    this.rng = deps.rng;
  }

  template(id: string): DeploymentTemplate | undefined {
    return this.world.deploymentTemplates.find((t) => t.id === id || t.name === id);
  }

  job(id: string): DeploymentJob | undefined {
    return this.world.deploymentJobs.find((j) => j.id === id);
  }

  run(jobId: string, options: { failureRate?: number } = {}): DeploymentOutcome {
    const job = this.job(jobId);
    const outcome: DeploymentOutcome = { jobId, succeeded: [], failed: [] };
    if (!job) return outcome;
    const template = this.template(job.templateId);
    if (!template) {
      job.status = 'failed';
      return outcome;
    }

    job.status = 'running';
    job.startedAt = this.bus?.getSimTime() ?? 0;
    const createdSystems: string[] = [];
    let index = 0;

    for (const target of job.targets) {
      index += 1;
      const asset = this.world.assets.find((a) => a.id === target.assetId);
      if (!asset) {
        target.status = 'failed';
        target.message = 'equipement inconnu dans le parc';
        outcome.failed.push({ assetId: target.assetId, reason: target.message });
        continue;
      }
      if (!asset.powered) {
        target.status = 'failed';
        target.message = 'equipement hors tension : demarrage reseau impossible';
        outcome.failed.push({ assetId: target.assetId, reason: target.message });
        continue;
      }
      if (asset.networkNodeId === undefined) {
        target.status = 'failed';
        target.message = 'aucune interface reseau associee';
        outcome.failed.push({ assetId: target.assetId, reason: target.message });
        continue;
      }
      // Echec controle et reproductible : sert aux scenarios de reprise.
      const failureRate = options.failureRate ?? 0;
      if (failureRate > 0 && this.rng !== undefined && this.rng.next() < failureRate) {
        target.status = 'failed';
        target.message = 'echec de deploiement de l image (transfert interrompu)';
        outcome.failed.push({ assetId: target.assetId, reason: target.message });
        continue;
      }

      const hostname = template.namingPattern
        .replace('{n}', String(index).padStart(2, '0'))
        .toLowerCase();
      const system: SystemState = createSystem({
        id: `sys-${hostname}`,
        hostname,
        os: template.os,
        osVersion: template.osVersion,
        networkNodeId: asset.networkNodeId,
        ...(template.joinDomain === undefined ? {} : { domain: template.joinDomain }),
      });
      system.packages = template.packages.map((name) => ({
        name,
        version: '1.0',
        state: 'installed',
      }));
      this.world.systems.push(system);
      createdSystems.push(system.id);

      const node = this.network.node(asset.networkNodeId);
      if (node) {
        node.hostname = hostname;
        if (template.networkConfig === 'dhcp') {
          const iface = node.interfaces[0];
          if (iface) this.network.renewDhcp(node.id, iface.name);
        }
      }

      target.status = 'success';
      target.message = `${hostname} deploye`;
      outcome.succeeded.push(target.assetId);
    }

    this.created.set(job.id, createdSystems);
    job.finishedAt = this.bus?.getSimTime() ?? 0;
    job.status = outcome.failed.length === 0 ? 'completed' : 'failed';
    this.bus?.emit({
      category: 'system',
      type: 'deployment.finished',
      payload: { jobId, succeeded: outcome.succeeded.length, failed: outcome.failed.length },
      significant: true,
      label: `Deploiement ${job.id} : ${outcome.succeeded.length} reussi(s), ${outcome.failed.length} echec(s)`,
    });
    return outcome;
  }

  /** Retour arriere : supprime les systemes crees par ce deploiement. */
  rollback(jobId: string): { ok: boolean; removed: number } {
    const job = this.job(jobId);
    const ids = this.created.get(jobId) ?? [];
    if (!job) return { ok: false, removed: 0 };
    this.world.systems = this.world.systems.filter((s) => !ids.includes(s.id));
    for (const target of job.targets) {
      if (target.status === 'success') {
        target.status = 'pending';
        target.message = 'annule par retour arriere';
      }
    }
    job.status = 'rolled-back';
    this.created.delete(jobId);
    this.bus?.emit({
      category: 'system',
      type: 'deployment.rolled-back',
      payload: { jobId, removed: ids.length },
      significant: true,
      label: `Retour arriere du deploiement ${jobId}`,
    });
    return { ok: true, removed: ids.length };
  }
}
