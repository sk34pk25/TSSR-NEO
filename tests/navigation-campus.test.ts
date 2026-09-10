import { describe, expect, it } from 'vitest';
import {
  buildCampusScene,
  campusNavigation,
  CAMPUS_SPAWN,
  CAMPUS_ZONES,
  NpcRuntime,
  npcs,
  zoneEntryPoint,
  type Vec3,
} from '@tssr/rendering';

/**
 * Navigation et presence.
 *
 * Chaque verification correspond a un defaut reellement constate : des
 * personnages enfonces dans une cloison, un point de passage valant l origine
 * du monde, et des trajets traversant trois murs. Ce sont des faits
 * geometriques, donc verifiables sans oeil humain.
 */

const navigation = campusNavigation();
const scene = buildCampusScene({});

/** Le corps occupe un volume : on teste son pourtour, pas son centre. */
function corpsEnCollision(position: Vec3): string[] {
  const heurts = new Set<string>();
  for (const hauteur of [0.35, 1, 1.6]) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const point: Vec3 = [
        position[0] + Math.cos(angle) * 0.28,
        hauteur,
        position[2] + Math.sin(angle) * 0.28,
      ];
      for (const collider of scene.colliders) {
        if (
          point[0] > collider.min[0] + 0.02 &&
          point[0] < collider.max[0] - 0.02 &&
          point[1] > collider.min[1] + 0.02 &&
          point[1] < collider.max[1] - 0.02 &&
          point[2] > collider.min[2] + 0.02 &&
          point[2] < collider.max[2] - 0.02
        ) {
          heurts.add(collider.id);
        }
      }
    }
  }
  return [...heurts];
}

describe('espace marchable', () => {
  it('couvre une surface exploitable du batiment', () => {
    const stats = navigation.statistiques();
    expect(stats.marchables).toBeGreaterThan(4000);
    // Une grille entierement marchable signifierait que les murs sont ignores.
    expect(stats.marchables).toBeLessThan(stats.cellules);
  });

  it('refuse de marcher dans un mur', () => {
    for (const zone of CAMPUS_ZONES) {
      const dansLeMur: Vec3 = [zone.center[0] - zone.size[0] / 2, 0, zone.center[2]];
      expect(navigation.estMarchable(dansLeMur), zone.id).toBe(false);
    }
  });

  it('ramene toujours un point invalide sur le sol le plus proche', () => {
    for (const zone of CAMPUS_ZONES) {
      const dansLeMur: Vec3 = [zone.center[0] - zone.size[0] / 2, 0, zone.center[2]];
      const rattrape = navigation.pointSur(dansLeMur);
      expect(rattrape, zone.id).toBeDefined();
      expect(navigation.estMarchable(rattrape as Vec3), zone.id).toBe(true);
    }
  });

  it('accepte le point d apparition et chaque entree de piece', () => {
    expect(navigation.estMarchable(CAMPUS_SPAWN)).toBe(true);
    for (const zone of CAMPUS_ZONES) {
      expect(navigation.estMarchable(zoneEntryPoint(zone).position), zone.id).toBe(true);
    }
  });
});

describe('trajets', () => {
  const parcours: [string, string][] = [
    ['reception', 'offices'],
    ['offices', 'command-center'],
    ['command-center', 'network-room'],
    ['network-room', 'datacenter'],
    ['datacenter', 'training-lab'],
  ];

  for (const [depart, arrivee] of parcours) {
    it(`relie ${depart} a ${arrivee} sans traverser de solide`, () => {
      const a = zoneEntryPoint(CAMPUS_ZONES.find((z) => z.id === depart)!).position;
      const b = zoneEntryPoint(CAMPUS_ZONES.find((z) => z.id === arrivee)!).position;
      const chemin = navigation.chemin(a, b);
      expect(chemin, `${depart} -> ${arrivee}`).toBeDefined();
      const trace = chemin as Vec3[];
      expect(trace.length).toBeGreaterThan(1);
      // Chaque segment du chemin lisse doit rester entierement degage.
      for (let index = 0; index < trace.length - 1; index += 1) {
        expect(
          navigation.vueDegagee(trace[index] as Vec3, trace[index + 1] as Vec3),
          `segment ${index} de ${depart} vers ${arrivee}`,
        ).toBe(true);
      }
    });
  }

  it('lisse le chemin au lieu de rendre une cellule sur deux', () => {
    const a = zoneEntryPoint(CAMPUS_ZONES[0]!).position;
    const b = zoneEntryPoint(CAMPUS_ZONES[8]!).position;
    const chemin = navigation.chemin(a, b) as Vec3[];
    const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
    // Un chemin de grille brut compterait un point tous les 25 centimetres.
    expect(chemin.length).toBeLessThan(distance / 2);
  });
});

describe('placement des personnages', () => {
  it('aucun personnage n est dans une geometrie solide', () => {
    for (const personne of npcs()) {
      const sur = navigation.pointSur(personne.position) as Vec3;
      expect(corpsEnCollision(sur), personne.nom).toEqual([]);
    }
  });

  it('aucune destination ne vaut l origine du monde', () => {
    for (const personne of npcs()) {
      for (const etape of personne.itineraire ?? []) {
        expect(
          etape.point[0] === 0 && etape.point[1] === 0 && etape.point[2] === 0,
          `${personne.nom} : ${etape.nom}`,
        ).toBe(false);
      }
    }
  });

  it('chaque destination est atteignable depuis la precedente', () => {
    for (const personne of npcs()) {
      const etapes = personne.itineraire ?? [];
      for (let index = 0; index < etapes.length; index += 1) {
        const a = etapes[index]?.point as Vec3;
        const b = etapes[(index + 1) % etapes.length]?.point as Vec3;
        if (!a || !b) continue;
        expect(navigation.chemin(a, b), `${personne.nom} : etape ${index}`).toBeDefined();
      }
    }
  });
});

describe('vie du campus', () => {
  it('personne ne quitte le sol marchable, meme apres une longue simulation', () => {
    const vie = new NpcRuntime();
    // Cinq minutes simulees, au pas de seize millisecondes.
    for (let image = 0; image < 60 * 60 * 5; image += 1) {
      vie.avancer(1 / 60);
      if (image % 300 !== 0) continue;
      for (const presence of vie.presences()) {
        expect(navigation.estMarchable(presence.position), `${presence.id} a l image ${image}`).toBe(
          true,
        );
      }
    }
  });

  it('les personnes qui ont un itineraire parcourent reellement le batiment', () => {
    const vie = new NpcRuntime();
    const depart = new Map(vie.presences().map((p) => [p.id, p.position]));
    // On mesure l eloignement maximal atteint, pas la position finale : un
    // aller-retour ramene au point de depart sans que personne soit reste immobile.
    const eloignementMax = new Map<string, number>();
    for (let image = 0; image < 60 * 90; image += 1) {
      vie.avancer(1 / 60);
      if (image % 30 !== 0) continue;
      for (const presence of vie.presences()) {
        const avant = depart.get(presence.id) as Vec3;
        const distance = Math.hypot(
          presence.position[0] - avant[0],
          presence.position[2] - avant[2],
        );
        eloignementMax.set(presence.id, Math.max(eloignementMax.get(presence.id) ?? 0, distance));
      }
    }
    for (const personne of npcs().filter((p) => (p.itineraire?.length ?? 0) > 1)) {
      expect(eloignementMax.get(personne.id) ?? 0, personne.nom).toBeGreaterThan(3);
    }
  });

  it('personne ne se teleporte : chaque pas reste a echelle humaine', () => {
    const vie = new NpcRuntime();
    let precedent = new Map(vie.presences().map((p) => [p.id, p.position]));
    for (let image = 0; image < 60 * 120; image += 1) {
      vie.avancer(1 / 60);
      const courant = new Map(vie.presences().map((p) => [p.id, p.position]));
      for (const [id, position] of courant) {
        const avant = precedent.get(id) as Vec3;
        const pas = Math.hypot(position[0] - avant[0], position[2] - avant[2]);
        // Une vitesse humaine a soixante images par seconde : deux centimetres.
        expect(pas, `${id} a l image ${image}`).toBeLessThan(0.06);
      }
      precedent = courant;
    }
  });

  it('une conversation suspend le deplacement', () => {
    const vie = new NpcRuntime();
    const mobile = npcs().find((personne) => (personne.itineraire?.length ?? 0) > 1);
    expect(mobile).toBeDefined();
    for (let image = 0; image < 600; image += 1) vie.avancer(1 / 60);
    vie.engager(mobile!.id, true);
    const avant = vie.presences().find((p) => p.id === mobile!.id)?.position as Vec3;
    for (let image = 0; image < 180; image += 1) vie.avancer(1 / 60);
    const apres = vie.presences().find((p) => p.id === mobile!.id) as { position: Vec3; etat: string };
    expect(apres.etat).toBe('interacting');
    expect(Math.hypot(apres.position[0] - avant[0], apres.position[2] - avant[2])).toBeLessThan(0.01);
  });
});

describe('circulation', () => {
  it('l axe de chaque porte reste degage sur plusieurs metres', () => {
    /*
     * Le mobilier barrait l entree de six pieces sur neuf : on y butait des le
     * premier pas, et l equipement qu on venait manipuler restait hors
     * d atteinte. Une piece doit s ouvrir sur une allee.
     */
    for (const zone of CAMPUS_ZONES) {
      const entree = zoneEntryPoint(zone);
      // L allee se mesure selon l axe de la porte, pas selon le regard : on
      // arrive desormais tourne vers l equipement de la piece.
      const versCouloir = zone.doorSide === 'south' ? 1 : -1;
      const direction: Vec3 = [0, 0, -versCouloir];
      let libre = 0;
      for (let distance = 0; distance < 9; distance += 0.1) {
        const point: Vec3 = [
          entree.position[0] + direction[0] * distance,
          0,
          entree.position[2] + direction[2] * distance,
        ];
        if (!navigation.estMarchable(point)) break;
        libre = distance;
      }
      expect(libre, `allee de ${zone.id}`).toBeGreaterThan(2.5);
    }
  });

  it('ce qu on vient manipuler est a portee depuis cette allee', () => {
    for (const zone of CAMPUS_ZONES) {
      const manipulables = scene.nodes.filter(
        (node) =>
          node.id.startsWith(zone.id) &&
          (node.interactive?.kind === 'rack' || node.interactive?.kind === 'workstation'),
      );
      if (manipulables.length === 0) continue;

      const entree = zoneEntryPoint(zone);
      // L allee se mesure selon l axe de la porte, pas selon le regard : on
      // arrive desormais tourne vers l equipement de la piece.
      const versCouloir = zone.doorSide === 'south' ? 1 : -1;
      const direction: Vec3 = [0, 0, -versCouloir];
      let meilleure = Number.POSITIVE_INFINITY;
      for (let distance = 0; distance < 9; distance += 0.1) {
        const point: Vec3 = [
          entree.position[0] + direction[0] * distance,
          0,
          entree.position[2] + direction[2] * distance,
        ];
        if (!navigation.estMarchable(point)) break;
        for (const node of manipulables) {
          meilleure = Math.min(
            meilleure,
            Math.hypot(node.position[0] - point[0], node.position[2] - point[2]),
          );
        }
      }
      // La portee d interaction vaut 2,60 m pour un objet.
      expect(meilleure, `objet manipulable de ${zone.id}`).toBeLessThanOrEqual(2.6);
    }
  });
});
