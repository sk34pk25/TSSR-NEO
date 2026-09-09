import type { MonitoringAlert, MonitoringCheck, SystemState, WorldState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import { NetworkEngine, serviceAvailable } from '@tssr/sim-network';

export interface CheckSample {
  checkId: string;
  at: number;
  ok: boolean;
  value?: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

/**
 * Supervision NEO : toutes les mesures proviennent de l etat reel de la simulation.
 * Aucune valeur n est inventee ; une sonde sans donnee le declare.
 */
export class MonitoringEngine {
  private readonly world: WorldState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;
  private readonly systems: Map<string, SystemState>;
  private readonly history = new Map<string, CheckSample[]>();

  constructor(
    world: WorldState,
    deps: { network: NetworkEngine; bus?: EventBus },
  ) {
    this.world = world;
    this.network = deps.network;
    this.bus = deps.bus;
    this.systems = new Map(world.systems.map((s) => [s.networkNodeId, s]));
  }

  private now(): number {
    return this.bus?.getSimTime() ?? this.world.simTime;
  }

  /** Point de supervision : la sonde est executee contre le monde, pas simulee. */
  sample(check: MonitoringCheck): CheckSample {
    const at = this.now();
    const node = this.network.node(check.targetNodeId);
    if (!node) {
      return { checkId: check.id, at, ok: false, severity: 'critical', message: 'cible inconnue' };
    }
    if (!node.powered) {
      return { checkId: check.id, at, ok: false, severity: 'critical', message: `${node.hostname} hors tension` };
    }

    switch (check.metric) {
      case 'icmp':
      case 'latency': {
        const address = node.interfaces.flatMap((i) => i.addresses)[0]?.address;
        if (address === undefined) {
          return { checkId: check.id, at, ok: false, severity: 'critical', message: 'aucune adresse IP a superviser' };
        }
        const probe = this.probeSource(check.targetNodeId);
        if (probe === undefined) {
          return { checkId: check.id, at, ok: false, severity: 'warning', message: 'aucune sonde disponible' };
        }
        const reach = this.network.reach(probe, address);
        if (!reach.delivered || !reach.returnOk) {
          return {
            checkId: check.id,
            at,
            ok: false,
            severity: 'critical',
            message: reach.failure?.detail ?? 'aucune reponse',
          };
        }
        const rtt = Math.round(reach.latencyMs * 2 * 100) / 100;
        if (check.metric === 'latency' && check.criticalThreshold !== undefined && rtt > check.criticalThreshold) {
          return { checkId: check.id, at, ok: false, value: rtt, severity: 'critical', message: `latence ${rtt} ms` };
        }
        if (check.metric === 'latency' && check.warningThreshold !== undefined && rtt > check.warningThreshold) {
          return { checkId: check.id, at, ok: false, value: rtt, severity: 'warning', message: `latence ${rtt} ms` };
        }
        return { checkId: check.id, at, ok: true, value: rtt, severity: 'info', message: `repond en ${rtt} ms` };
      }
      case 'service': {
        const service = node.services.find((s) => s.id === check.serviceId);
        if (!service) {
          return { checkId: check.id, at, ok: false, severity: 'warning', message: 'service supervise introuvable' };
        }
        const up = serviceAvailable(node, service);
        return {
          checkId: check.id,
          at,
          ok: up,
          severity: up ? 'info' : 'critical',
          message: up ? `${service.name} operationnel` : `${service.name} indisponible (${service.status})`,
        };
      }
      case 'cpu':
      case 'memory':
      case 'disk':
      case 'temperature': {
        const system = this.systems.get(check.targetNodeId);
        if (!system) {
          return { checkId: check.id, at, ok: false, severity: 'warning', message: 'aucun systeme instrumente sur cette cible' };
        }
        const r = system.resources;
        const value =
          check.metric === 'cpu'
            ? r.cpuPercent
            : check.metric === 'memory'
              ? Math.round((r.memoryUsedMb / r.memoryTotalMb) * 100)
              : check.metric === 'disk'
                ? Math.round((r.diskUsedGb / r.diskTotalGb) * 100)
                : r.temperatureC;
        if (value === undefined) {
          return { checkId: check.id, at, ok: false, severity: 'warning', message: 'mesure non disponible sur cet equipement' };
        }
        if (check.criticalThreshold !== undefined && value >= check.criticalThreshold) {
          return { checkId: check.id, at, ok: false, value, severity: 'critical', message: `${check.metric} a ${value}` };
        }
        if (check.warningThreshold !== undefined && value >= check.warningThreshold) {
          return { checkId: check.id, at, ok: false, value, severity: 'warning', message: `${check.metric} a ${value}` };
        }
        return { checkId: check.id, at, ok: true, value, severity: 'info', message: `${check.metric} a ${value}` };
      }
      default:
        return { checkId: check.id, at, ok: false, severity: 'warning', message: 'metrique non supervisee' };
    }
  }

  /**
   * Une sonde doit partir d une machine reelle du reseau, sinon la mesure n a pas de sens.
   * On privilegie un collecteur declare, puis n importe quel equipement adresse.
   */
  private probeSource(targetNodeId: string): string | undefined {
    const candidates = this.world.network.nodes.filter(
      (n) =>
        n.id !== targetNodeId &&
        n.powered &&
        n.interfaces.some((i) => i.enabled && i.addresses.length > 0),
    );
    const collector = candidates.find((n) => n.services.some((s) => s.kind === 'snmp'));
    if (collector) return collector.id;
    const router = candidates.find((n) => n.kind === 'router' || n.kind === 'firewall');
    if (router) return router.id;
    return candidates[0]?.id;
  }

  /** Execute toutes les sondes actives et met a jour les alertes ouvertes. */
  runAll(): MonitoringAlert[] {
    const raised: MonitoringAlert[] = [];
    for (const check of this.world.monitoringChecks) {
      if (!check.enabled) continue;
      const sample = this.sample(check);
      const samples = this.history.get(check.id) ?? [];
      samples.push(sample);
      if (samples.length > 120) samples.splice(0, samples.length - 120);
      this.history.set(check.id, samples);

      const open = this.world.monitoringAlerts.find((a) => a.checkId === check.id && a.clearedAt === undefined);
      if (!sample.ok) {
        if (open) {
          open.severity = sample.severity === 'info' ? open.severity : sample.severity;
          open.message = sample.message;
          continue;
        }
        const alert: MonitoringAlert = {
          id: `alert-${check.id}-${sample.at}`,
          checkId: check.id,
          severity: sample.severity === 'info' ? 'warning' : sample.severity,
          raisedAt: sample.at,
          message: sample.message,
          ...(sample.value === undefined ? {} : { value: sample.value }),
        };
        this.world.monitoringAlerts.push(alert);
        raised.push(alert);
        this.bus?.emit({
          category: 'incident',
          type: 'monitoring.alert.raised',
          payload: { checkId: check.id, severity: alert.severity },
          significant: true,
          label: `Alerte : ${check.name} - ${sample.message}`,
        });
      } else if (open) {
        open.clearedAt = sample.at;
        this.bus?.emit({
          category: 'incident',
          type: 'monitoring.alert.cleared',
          payload: { checkId: check.id },
          significant: true,
          label: `Retour a la normale : ${check.name}`,
        });
      }
    }
    return raised;
  }

  acknowledge(alertId: string, by: string): boolean {
    const alert = this.world.monitoringAlerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.acknowledgedBy = by;
    this.bus?.emit({ category: 'incident', type: 'monitoring.alert.acknowledged', payload: { alertId, by } });
    return true;
  }

  activeAlerts(): MonitoringAlert[] {
    return this.world.monitoringAlerts.filter((a) => a.clearedAt === undefined);
  }

  seriesFor(checkId: string): readonly CheckSample[] {
    return this.history.get(checkId) ?? [];
  }

  /**
   * Correlation simple : les alertes qui partagent une cause amont probable.
   * Elle aide a lire, elle ne donne jamais la reponse d un exercice de diagnostic.
   */
  correlate(): { rootNodeId: string; alertIds: string[] }[] {
    const groups = new Map<string, string[]>();
    for (const alert of this.activeAlerts()) {
      const check = this.world.monitoringChecks.find((c) => c.id === alert.checkId);
      if (!check) continue;
      const node = this.network.node(check.targetNodeId);
      if (!node) continue;
      const upstream = node.routes.find((r) => r.destination === '0.0.0.0/0')?.via ?? node.id;
      const list = groups.get(upstream) ?? [];
      list.push(alert.id);
      groups.set(upstream, list);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([rootNodeId, alertIds]) => ({ rootNodeId, alertIds }));
  }
}
