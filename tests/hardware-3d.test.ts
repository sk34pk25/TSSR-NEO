import { describe, expect, it } from 'vitest';
import { EventBus } from '@tssr/events';
import { SimulationWorld } from '@tssr/sim-world';
import {
  buildCampusScene,
  buildDatacenterScene,
  buildHardwareScene,
  CAMPUS_ZONES,
  CampusCameraController,
  hardwarePatches,
  resolveCollisions,
} from '@tssr/rendering';
import { trainingLabScenario } from '@tssr/module-training-lab';

function world() {
  const state = trainingLabScenario.build({ seed: 42, params: {} });
  return new SimulationWorld(state, { bus: new EventBus(), seed: 42 });
}

describe('campus 3D', () => {
  it('chaque zone visible mene a un ecran reel de la plateforme', () => {
    const routes = new Set([
      'tickets',
      'supervision',
      'laboratoire',
      'mission',
      'connaissances',
      'progression',
    ]);
    expect(CAMPUS_ZONES.length).toBeGreaterThanOrEqual(9);
    for (const zone of CAMPUS_ZONES) {
      expect(routes.has(zone.route)).toBe(true);
      expect(zone.purpose.length).toBeGreaterThan(20);
    }
  });

  it('la scene expose des portes interactives et des volumes de collision', () => {
    const scene = buildCampusScene();
    const doors = scene.nodes.filter((n) => n.interactive?.kind === 'door');
    expect(doors).toHaveLength(CAMPUS_ZONES.length);
    expect(scene.colliders.length).toBeGreaterThan(CAMPUS_ZONES.length * 4);
    expect(scene.anchors).toHaveLength(CAMPUS_ZONES.length);
  });

  it('les collisions empechent de traverser un mur', () => {
    const scene = buildCampusScene();
    const insideCorridor: [number, number, number] = [0, 1.6, 0];
    // Une tentative de traversee du mur du fond d une piece est repoussee.
    const zone = CAMPUS_ZONES[0]!;
    const beyond: [number, number, number] = [zone.center[0], 1.6, zone.center[2] - 6];
    const resolved = resolveCollisions(insideCorridor, beyond, scene.colliders);
    expect(resolved).not.toEqual(beyond);
  });

  it('changer de mode de camera ne deplace pas le joueur', () => {
    const controller = new CampusCameraController([-12, 1.6, 0], Math.PI / 2);
    controller.setColliders(buildCampusScene().colliders);
    const before = controller.getPosition();
    controller.setMode('first-person');
    const first = controller.current();
    controller.setMode('tactical');
    const tactical = controller.current();
    expect(controller.getPosition()).toEqual(before);
    expect(first.position).not.toEqual(tactical.position);
    expect(tactical.transitionMs).toBeGreaterThan(0);
  });
});

describe('materiel en trois dimensions', () => {
  it('la scene materielle est derivee de l etat de simulation', () => {
    const sim = world();
    const scene = buildDatacenterScene(sim.state);
    const assets = scene.nodes.filter((n) => n.interactive?.kind === 'asset');
    const ports = scene.nodes.filter((n) => n.interactive?.kind === 'port');
    const cables = scene.nodes.filter((n) => n.interactive?.kind === 'cable');
    expect(assets.length).toBeGreaterThanOrEqual(sim.state.assets.length);
    expect(ports).toHaveLength(sim.state.assets.reduce((sum, a) => sum + a.ports.length, 0));
    expect(cables).toHaveLength(sim.state.cables.length);
  });

  it('les temoins refletent l etat reel des ports', () => {
    const sim = world();
    sim.hardware.refreshLeds();
    const { layout } = buildHardwareScene(sim.state);
    const before = hardwarePatches(sim.state, layout).find((p) => p.id === 'hardware-leds');
    expect(before?.instanceColors).toBeDefined();
    const litBefore = countLit(before?.instanceColors);

    // Extinction du commutateur : tous ses temoins doivent s eteindre.
    sim.hardware.setPower('asset-sw-lab', false);
    const after = hardwarePatches(sim.state, layout).find((p) => p.id === 'hardware-leds');
    expect(countLit(after?.instanceColors)).toBeLessThan(litBefore);
  });

  it('retirer un cable coupe reellement la liaison reseau', () => {
    const sim = world();
    sim.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    sim.network.renewDhcp('pc-camille', 'eth0');
    expect(sim.network.reach('pc-camille', '10.20.20.10').delivered).toBe(true);

    const cable = sim.state.cables.find(
      (c) => c.from.assetId === 'asset-pc-camille' || c.to.assetId === 'asset-pc-camille',
    );
    expect(cable).toBeDefined();
    expect(sim.hardware.unpatch(cable!.id)).toBe(true);

    const after = sim.network.reach('pc-camille', '10.20.20.10');
    expect(after.delivered).toBe(false);
    // Le cable a bien disparu de la scene, puisqu elle derive de l etat.
    const scene = buildDatacenterScene(sim.state);
    expect(scene.nodes.some((n) => n.id === `cable-${cable!.id}`)).toBe(false);
  });

  it('rebrasser retablit la liaison', () => {
    const sim = world();
    sim.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    const cable = sim.state.cables.find(
      (c) => c.from.assetId === 'asset-pc-camille' || c.to.assetId === 'asset-pc-camille',
    )!;
    const from = cable.from;
    const to = cable.to;
    sim.hardware.unpatch(cable.id);
    expect(sim.network.reach('pc-camille', '10.20.20.10').delivered).toBe(false);

    const patched = sim.hardware.patch(from, to);
    expect(patched.ok).toBe(true);
    sim.network.renewDhcp('pc-camille', 'eth0');
    expect(sim.network.reach('pc-camille', '10.20.20.10').delivered).toBe(true);
  });

  it('un equipement hors tension rend ses services injoignables', () => {
    const sim = world();
    sim.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    sim.network.renewDhcp('pc-camille', 'eth0');
    expect(sim.network.reach('pc-camille', '10.20.20.10').delivered).toBe(true);
    sim.hardware.setPower('asset-srv-neo', false);
    expect(sim.network.reach('pc-camille', '10.20.20.10').delivered).toBe(false);
  });
});

function countLit(colors: Float32Array | undefined): number {
  if (!colors) return 0;
  let lit = 0;
  for (let i = 0; i < colors.length; i += 4) {
    if ((colors[i] ?? 0) + (colors[i + 1] ?? 0) + (colors[i + 2] ?? 0) > 0.4) lit += 1;
  }
  return lit;
}
