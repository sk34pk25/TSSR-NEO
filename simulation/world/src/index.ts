import type { SystemState, WorldState } from '@tssr/contracts';
import { zWorldState, parseContract } from '@tssr/contracts';
import { EventBus, Rng, SimClock } from '@tssr/events';
import { NetworkEngine } from '@tssr/sim-network';
import { SystemEngine, Terminal, type TerminalOptions } from '@tssr/sim-systems';
import { ItsmEngine } from '@tssr/sim-itsm';
import { MonitoringEngine } from '@tssr/sim-monitoring';
import { HardwareEngine } from '@tssr/sim-hardware';
import { BackupEngine } from '@tssr/sim-backup';
import { VirtualizationEngine } from '@tssr/sim-virtualization';
import { CloudEngine } from '@tssr/sim-cloud';
import { RemoteOperationsEngine } from '@tssr/sim-remote';
import { DeploymentEngine } from '@tssr/sim-deployment';

export interface SimulationWorldOptions {
  bus?: EventBus;
  seed?: number;
  validate?: boolean;
}

/**
 * Monde simule complet : une seule source de verite partagee par tous les moteurs.
 * Une modification faite par le terminal, la 3D ou l interface produit
 * exactement les memes consequences partout.
 */
export class SimulationWorld {
  readonly state: WorldState;
  readonly bus: EventBus;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly network: NetworkEngine;
  readonly itsm: ItsmEngine;
  readonly monitoring: MonitoringEngine;
  readonly hardware: HardwareEngine;
  readonly backup: BackupEngine;
  readonly virtualization: VirtualizationEngine;
  readonly cloud: CloudEngine;
  readonly remote: RemoteOperationsEngine;
  readonly deployment: DeploymentEngine;
  private readonly systemEngines = new Map<string, SystemEngine>();

  constructor(state: WorldState, options: SimulationWorldOptions = {}) {
    this.state =
      options.validate === true ? parseContract(zWorldState, state, 'WorldState') : state;
    this.bus = options.bus ?? new EventBus();
    this.bus.setSimTime(this.state.simTime);
    this.clock = new SimClock(this.state.simTime);
    this.rng = new Rng(options.seed ?? this.state.seed);

    this.network = new NetworkEngine(this.state.network, { bus: this.bus, rng: this.rng });
    this.itsm = new ItsmEngine(this.state, { bus: this.bus });
    this.monitoring = new MonitoringEngine(this.state, { network: this.network, bus: this.bus });
    this.hardware = new HardwareEngine(this.state, { network: this.network, bus: this.bus });
    this.backup = new BackupEngine(this.state, { bus: this.bus });
    this.virtualization = new VirtualizationEngine(this.state, {
      network: this.network,
      bus: this.bus,
    });
    this.cloud = new CloudEngine(this.state, { bus: this.bus });
    this.remote = new RemoteOperationsEngine(this.state, { network: this.network, bus: this.bus });
    this.deployment = new DeploymentEngine(this.state, {
      network: this.network,
      bus: this.bus,
      rng: this.rng,
    });

    for (const system of this.state.systems) {
      this.systemEngines.set(
        system.id,
        new SystemEngine(system, { network: this.network, bus: this.bus }),
      );
    }
    this.hardware.refreshLeds();
  }

  systemState(id: string): SystemState | undefined {
    return this.state.systems.find(
      (s) => s.id === id || s.hostname === id || s.networkNodeId === id,
    );
  }

  system(id: string): SystemEngine | undefined {
    const system = this.systemState(id);
    if (!system) return undefined;
    let engine = this.systemEngines.get(system.id);
    if (!engine) {
      engine = new SystemEngine(system, { network: this.network, bus: this.bus });
      this.systemEngines.set(system.id, engine);
    }
    return engine;
  }

  /** Ouvre un terminal reellement branche sur l etat du systeme designe. */
  terminal(systemId: string, options: TerminalOptions = {}): Terminal | undefined {
    const engine = this.system(systemId);
    if (!engine) return undefined;
    return new Terminal(
      {
        system: engine.system,
        systems: engine,
        network: this.network,
        bus: this.bus,
        lookupSystem: (nodeId: string) => this.system(nodeId),
      },
      options,
    );
  }

  /** Avance le temps simule et declenche les taches programmees. */
  advance(deltaMs: number): void {
    this.clock.advance(deltaMs);
    this.state.simTime = this.clock.now();
    this.bus.setSimTime(this.state.simTime);
  }

  /** Copie profonde de l etat, base des instantanes et des sauvegardes. */
  snapshotState(): WorldState {
    return structuredClone(this.state);
  }
}

export function createWorld(
  state: WorldState,
  options: SimulationWorldOptions = {},
): SimulationWorld {
  return new SimulationWorld(state, options);
}
