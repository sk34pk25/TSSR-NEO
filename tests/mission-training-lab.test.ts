import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus, Rng } from '@tssr/events';
import { SimulationWorld } from '@tssr/sim-world';
import {
  MissionRunner,
  ScenarioRegistry,
  applyVariant,
  findMissingPlaceholders,
  pickVariant,
} from '@tssr/mission-engine';
import { SwitchConsole } from '@tssr/sim-network';
import { zMissionDefinition, zModuleManifest, zWorldState } from '@tssr/contracts';
import {
  missionPosteSansReseau,
  trainingLabManifest,
  trainingLabScenario,
} from '@tssr/module-training-lab';

function bootstrap(variantId?: string) {
  const registry = new ScenarioRegistry().register(trainingLabScenario);
  const rng = new Rng(20260909);
  const variant = variantId
    ? missionPosteSansReseau.variants.find((v) => v.id === variantId)
    : pickVariant(missionPosteSansReseau, rng);
  const definition = applyVariant(missionPosteSansReseau, variant);
  const state = registry.build(definition.scenarioId, {
    seed: 20260909,
    params: variant?.parameters ?? {},
  });
  const bus = new EventBus();
  const world = new SimulationWorld(state, { bus, seed: 20260909 });
  const runner = new MissionRunner(definition, world, {
    ...(variant === undefined ? {} : { variantId: variant.id }),
    seed: 20260909,
  });
  return { world, runner, bus, definition };
}

describe('module NEO Training Lab', () => {
  it('respecte les contrats de module, de mission et de monde', () => {
    expect(zModuleManifest.safeParse(trainingLabManifest).success).toBe(true);
    expect(zMissionDefinition.safeParse(missionPosteSansReseau).success).toBe(true);
    const state = trainingLabScenario.build({ seed: 1, params: {} });
    const parsed = zWorldState.safeParse(state);
    if (!parsed.success) console.error(parsed.error.issues.slice(0, 5));
    expect(parsed.success).toBe(true);
  });

  it('ne laisse aucun parametre de variante non substitue', () => {
    for (const variant of missionPosteSansReseau.variants) {
      const applied = applyVariant(missionPosteSansReseau, variant);
      expect(findMissingPlaceholders(applied)).toEqual([]);
    }
  });
});

describe('mission : poste sans reseau', () => {
  let env: ReturnType<typeof bootstrap>;
  beforeEach(() => {
    env = bootstrap('var-vlan99');
    env.runner.start();
  });

  it('demarre avec une panne reelle et diagnosticable', () => {
    expect(env.runner.state.status).toBe('active');
    const lease = env.world.network.renewDhcp('pc-camille', 'eth0');
    expect(lease.success).toBe(false);
    expect(env.world.network.node('pc-camille')?.interfaces[0]?.addresses[0]?.address).toMatch(
      /^169\.254\./,
    );
    expect(env.runner.objectives().find((o) => o.id === 'obj-lease')?.status).toBe('pending');
  });

  it('la console du commutateur revele l ecart de configuration', () => {
    const console_ = new SwitchConsole(env.world.network, 'sw-lab', { bus: env.bus });
    const vlans = console_.execute('show vlan brief');
    expect(vlans.error).toBe(false);
    expect(vlans.output).toContain('QUARANTAINE');
    expect(vlans.output).toMatch(/QUARANTAINE\s+Gi0\/2/);
    expect(vlans.output).toMatch(/BUREAUX\s+Gi0\/1/);
  });

  it('refuse une commande de console inexistante', () => {
    const console_ = new SwitchConsole(env.world.network, 'sw-lab');
    const result = console_.execute('show interfaces trunk detail');
    expect(result.error).toBe(true);
    expect(result.output).toContain('n est pas disponible');
  });

  it('refuse un VLAN non declare sur le commutateur', () => {
    const console_ = new SwitchConsole(env.world.network, 'sw-lab');
    console_.execute('configure terminal');
    console_.execute('interface Gi0/2');
    const result = console_.execute('switchport access vlan 77');
    expect(result.error).toBe(true);
    expect(result.output).toContain('n est pas declare');
  });

  it('la correction du VLAN retablit reellement le service et valide les objectifs', () => {
    const console_ = new SwitchConsole(env.world.network, 'sw-lab', { bus: env.bus });
    console_.execute('configure terminal');
    console_.execute('interface Gi0/2');
    expect(console_.execute('switchport access vlan 10').error).toBe(false);
    console_.execute('end');

    const terminal = env.world.terminal('sys-pc-camille');
    expect(terminal).toBeDefined();
    const renew = terminal?.execute('ipconfig /renew');
    expect(renew?.exitCode).toBe(0);
    expect(renew?.stdout).toContain('10.20.10.');

    const ping = terminal?.execute('ping srv-neo.neo.lan');
    expect(ping?.exitCode).toBe(0);

    let tick = env.runner.tick();
    expect(tick.completed).toContain('obj-lease');
    expect(env.runner.objectives().find((o) => o.id === 'obj-ping-serveur')?.status).toBe(
      'completed',
    );
    expect(env.runner.objectives().find((o) => o.id === 'obj-dns')?.status).toBe('completed');
    expect(env.runner.objectives().find((o) => o.id === 'obj-verification')?.status).toBe(
      'completed',
    );
    expect(env.runner.state.status).toBe('active');

    env.world.itsm.comment('inc-2041', {
      author: 'technicien',
      authorRole: 'technician',
      body: 'Poste diagnostique sur site, comparaison avec un poste voisin fonctionnel.',
    });
    env.world.itsm.resolve(
      'inc-2041',
      'Le port Gi0/2 du commutateur sw-lab etait reste dans le VLAN 99 (quarantaine) apres les travaux. Il a ete replace dans le VLAN 10 puis le bail DHCP a ete renouvele sur le poste.',
      'Port laisse en VLAN de quarantaine lors du deplacement du poste pendant les travaux.',
    );

    tick = env.runner.tick();
    expect(tick.completed).toContain('obj-ticket');
    expect(env.runner.state.status).toBe('succeeded');
  });

  it('une solution alternative valide est acceptee : rebrancher sur un port du bon VLAN', () => {
    const link = env.world.state.network.links.find(
      (l) => l.a.nodeId === 'pc-camille' || l.b.nodeId === 'pc-camille',
    );
    expect(link).toBeDefined();
    // Le technicien rebranche le poste sur Gi0/4, deja dans le VLAN bureautique.
    const sw = env.world.network.node('sw-lab');
    const gi04 = sw?.interfaces.find((i) => i.name === 'Gi0/4');
    if (link && gi04) {
      if (link.a.nodeId === 'sw-lab') link.a.interfaceId = gi04.id;
      else link.b.interfaceId = gi04.id;
    }
    env.world.network.renewDhcp('pc-camille', 'eth0');
    env.runner.tick();
    expect(env.runner.objectives().find((o) => o.id === 'obj-lease')?.status).toBe('completed');
    expect(env.runner.objectives().find((o) => o.id === 'obj-ping-serveur')?.status).toBe(
      'completed',
    );
  });

  it('detecte un degat collateral sur le serveur', () => {
    env.world.network.setServiceStatus('srv-neo', 'svc-smb', 'stopped');
    env.runner.tick();
    const objective = env.runner.objectives().find((o) => o.id === 'obj-no-collateral');
    expect(objective?.status).toBe('pending');
    expect(objective?.detail).toContain('hors perimetre');
  });

  it('declenche la condition d echec si le serveur devient injoignable', () => {
    env.world.network.setNodePower('srv-neo', false);
    const tick = env.runner.tick();
    expect(tick.failed).toBeDefined();
    expect(env.runner.state.status).toBe('failed');
  });

  it('delivre les indices de facon progressive et contextuelle', () => {
    const first = env.runner.requestHint();
    expect(first?.level).toBe(1);
    const second = env.runner.requestHint();
    expect(second?.level).toBe(2);
    expect(env.runner.state.hintsUsed).toHaveLength(2);
    // En mode standard, le niveau 4 (solution) n est pas accessible.
    const levels = env.runner.availableHints().map((h) => h.level);
    expect(Math.max(...levels)).toBeLessThanOrEqual(3);
  });

  it('le mode expert reduit l aide disponible', () => {
    const expert = bootstrap('var-vlan99');
    const runner = new MissionRunner(expert.definition, expert.world, { difficulty: 'expert' });
    runner.start();
    expect(runner.availableHints().every((h) => h.level <= 1)).toBe(true);
    expect(runner.objectives().every((o) => o.detail === undefined)).toBe(true);
  });

  it('le score reflete la methode, pas seulement le resultat', () => {
    const console_ = new SwitchConsole(env.world.network, 'sw-lab', { bus: env.bus });
    console_.execute('configure terminal');
    console_.execute('interface Gi0/2');
    console_.execute('switchport access vlan 10');
    const terminal = env.world.terminal('sys-pc-camille');
    terminal?.execute('ipconfig /renew');
    terminal?.execute('ping srv-neo.neo.lan');
    env.world.itsm.resolve(
      'inc-2041',
      'Le port du poste etait dans le VLAN de quarantaine apres les travaux. Il a ete replace dans le VLAN bureautique et le bail renouvele.',
      'Erreur de brassage lors des travaux.',
    );
    env.runner.tick();
    const score = env.runner.score();
    expect(score.dimensions.technicalAccuracy).toBe(1);
    expect(score.dimensions.autonomy).toBe(1);
    expect(score.dimensions.verification).toBeGreaterThan(0);
    expect(score.overall).toBeGreaterThan(0.7);

    const summary = env.runner.summary();
    expect(summary.commandsUsed).toContain('ipconfig /renew');
    expect(summary.alternatives.length).toBeGreaterThanOrEqual(3);
    expect(summary.timeline.some((t) => t.type === 'mission.objective.completed')).toBe(true);
  });

  it('les indices consommes reduisent la dimension autonomie', () => {
    env.runner.requestHint();
    env.runner.requestHint();
    const score = env.runner.score();
    expect(score.dimensions.autonomy).toBeLessThan(1);
    expect(score.hintsUsed).toBe(2);
  });

  it('la variante VLAN 20 presente la meme competence avec une autre valeur', () => {
    const other = bootstrap('var-vlan20');
    other.runner.start();
    const sw = other.world.network.node('sw-lab');
    expect(sw?.interfaces.find((i) => i.name === 'Gi0/2')?.accessVlan).toBe(20);
    other.world.network.renewDhcp('pc-camille', 'eth0');
    other.runner.tick();
    // Dans le VLAN serveurs, aucune etendue DHCP ne correspond : l objectif reste non atteint.
    expect(other.runner.objectives().find((o) => o.id === 'obj-lease')?.status).toBe('pending');
  });
});

describe('supervision pendant la mission', () => {
  it('leve une alerte reelle quand le poste reste injoignable', () => {
    const env = bootstrap('var-vlan99');
    env.runner.start();
    const alerts = env.world.monitoring.runAll();
    const camille = alerts.find((a) => a.checkId === 'chk-camille-icmp');
    expect(camille).toBeDefined();
    expect(env.world.monitoring.activeAlerts().some((a) => a.checkId === 'chk-srv-icmp')).toBe(
      false,
    );
  });

  it('l alerte se resorbe une fois la panne corrigee', () => {
    const env = bootstrap('var-vlan99');
    env.runner.start();
    env.world.monitoring.runAll();
    expect(env.world.monitoring.activeAlerts().length).toBeGreaterThan(0);
    const console_ = new SwitchConsole(env.world.network, 'sw-lab');
    console_.execute('configure terminal');
    console_.execute('interface Gi0/2');
    console_.execute('switchport access vlan 10');
    env.world.network.renewDhcp('pc-camille', 'eth0');
    env.world.monitoring.runAll();
    expect(env.world.monitoring.activeAlerts().some((a) => a.checkId === 'chk-camille-icmp')).toBe(
      false,
    );
  });
});
