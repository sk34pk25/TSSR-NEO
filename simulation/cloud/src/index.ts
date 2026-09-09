import type { CloudResource, WorldState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';

export interface CostReport {
  hourly: number;
  monthlyEstimate: number;
  byKind: Record<string, number>;
}

export type CloudError = 'not-found' | 'parent-required' | 'invalid-parent' | 'in-use';

/**
 * Cloud pedagogique : hierarchie region / VPC / sous-reseau / ressource,
 * regles de securite et couts simules. Aucun compte fournisseur reel n est requis.
 */
export class CloudEngine {
  private readonly world: WorldState;
  private readonly bus: EventBus | undefined;

  constructor(world: WorldState, options: { bus?: EventBus } = {}) {
    this.world = world;
    this.bus = options.bus;
  }

  resource(id: string): CloudResource | undefined {
    return this.world.cloud.find((r) => r.id === id || r.name === id);
  }

  children(parentId: string): CloudResource[] {
    return this.world.cloud.filter((r) => r.parentId === parentId);
  }

  provision(resource: Omit<CloudResource, 'state'> & { state?: CloudResource['state'] }): {
    ok: boolean;
    error?: CloudError;
    detail?: string;
    resource?: CloudResource;
  } {
    // Une ressource reseau doit vivre dans un conteneur valide : la hierarchie est verifiee.
    const needsParent: CloudResource['kind'][] = ['subnet', 'vm', 'load-balancer'];
    if (needsParent.includes(resource.kind)) {
      if (resource.parentId === undefined) {
        return {
          ok: false,
          error: 'parent-required',
          detail: `une ressource ${resource.kind} doit etre rattachee`,
        };
      }
      const parent = this.resource(resource.parentId);
      if (!parent)
        return { ok: false, error: 'invalid-parent', detail: 'conteneur parent introuvable' };
      const expected = resource.kind === 'subnet' ? 'vpc' : 'subnet';
      if (parent.kind !== expected) {
        return {
          ok: false,
          error: 'invalid-parent',
          detail: `une ressource ${resource.kind} se place dans un ${expected}`,
        };
      }
    }
    const created: CloudResource = { state: 'running', ...resource };
    this.world.cloud.push(created);
    this.bus?.emit({
      category: 'config-change',
      type: 'cloud.resource.provisioned',
      payload: { id: created.id, kind: created.kind, region: created.region },
      significant: true,
      label: `Ressource cloud ${created.name} (${created.kind}) provisionnee`,
    });
    return { ok: true, resource: created };
  }

  /** Suppression refusee tant que des ressources filles existent : evite les orphelins. */
  deprovision(id: string): { ok: boolean; error?: CloudError; detail?: string } {
    const resource = this.resource(id);
    if (!resource) return { ok: false, error: 'not-found', detail: 'ressource introuvable' };
    const children = this.children(resource.id).filter((c) => c.state !== 'deleted');
    if (children.length > 0) {
      return {
        ok: false,
        error: 'in-use',
        detail: `${children.length} ressource(s) dependent encore de ${resource.name}`,
      };
    }
    resource.state = 'deleted';
    this.bus?.emit({
      category: 'config-change',
      type: 'cloud.resource.deleted',
      payload: { id: resource.id },
      significant: true,
      label: `Ressource cloud ${resource.name} supprimee`,
    });
    return { ok: true };
  }

  setState(id: string, state: CloudResource['state']): boolean {
    const resource = this.resource(id);
    if (!resource) return false;
    resource.state = state;
    return true;
  }

  /** Cout simule : rend visible l impact economique des choix d architecture. */
  cost(): CostReport {
    const byKind: Record<string, number> = {};
    let hourly = 0;
    for (const resource of this.world.cloud) {
      if (resource.state === 'deleted' || resource.state === 'stopped') continue;
      hourly += resource.hourlyCost;
      byKind[resource.kind] = (byKind[resource.kind] ?? 0) + resource.hourlyCost;
    }
    return {
      hourly: Math.round(hourly * 100) / 100,
      monthlyEstimate: Math.round(hourly * 730 * 100) / 100,
      byKind,
    };
  }

  /** Verifie qu une ressource est bien isolee : aucun groupe de securite ouvert a tous. */
  auditExposure(): { resourceId: string; issue: string }[] {
    const issues: { resourceId: string; issue: string }[] = [];
    for (const group of this.world.cloud.filter(
      (r) => r.kind === 'security-group' && r.state !== 'deleted',
    )) {
      const rules = group.properties.rules;
      if (!Array.isArray(rules)) continue;
      for (const rule of rules) {
        if (typeof rule !== 'object' || rule === null) continue;
        const record = rule as Record<string, unknown>;
        if (record.source === '0.0.0.0/0' && record.action !== 'deny') {
          issues.push({
            resourceId: group.id,
            issue: `port ${String(record.port ?? 'tous')} ouvert a Internet sans restriction`,
          });
        }
      }
    }
    return issues;
  }
}
