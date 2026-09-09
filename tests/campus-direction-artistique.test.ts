import { describe, expect, it } from 'vitest';
import {
  buildCampusScene,
  CAMPUS_ZONES,
  compacter,
  interactionLaPlusProche,
  MATERIALS,
  zoneAt,
  zoneById,
  zoneEntryPoint,
  zoneViewpoint,
  type Ambiance,
  type MaterialSpec,
  type Scene3DNode,
  type Vec3,
} from '@tssr/rendering';

/**
 * Criteres visuels minimaux du campus.
 *
 * Ces verifications ne remplacent pas un regard humain : elles empechent
 * seulement le retour silencieux des defauts constates dans l audit V0.3, ou
 * neuf salles identiques et vides, dans une palette entierement froide,
 * passaient toutes les portes de qualite existantes.
 */

const scene = buildCampusScene({});

/** Chaleur d une couleur : positive quand le rouge domine le bleu. */
function chaleur(couleur: Vec3): number {
  return couleur[0] - couleur[2];
}

function luminance(couleur: Vec3): number {
  return 0.2126 * couleur[0] + 0.7152 * couleur[1] + 0.0722 * couleur[2];
}

/** Emprise au sol d une piece, pour savoir ce qui s y trouve. */
function dansLaZone(node: Scene3DNode, zoneId: string): boolean {
  const zone = zoneById(zoneId);
  if (!zone) return false;
  const positions: Vec3[] = node.instances
    ? Array.from({ length: node.instances.length / 16 }, (_, index) => {
        const base = index * 16;
        return [
          node.instances?.[base + 12] ?? 0,
          node.instances?.[base + 13] ?? 0,
          node.instances?.[base + 14] ?? 0,
        ] as Vec3;
      })
    : [node.position];
  return positions.some(
    (position) =>
      Math.abs(position[0] - zone.center[0]) <= zone.size[0] / 2 &&
      Math.abs(position[2] - zone.center[2]) <= zone.size[1] / 2 &&
      position[1] > 0.05 &&
      position[1] < 2.6,
  );
}

/** Toutes les positions occupees par un materiau donne, instances comprises. */
function positionsDuMateriau(material: MaterialSpec): Vec3[] {
  const cle = JSON.stringify(material);
  const positions: Vec3[] = [];
  for (const node of scene.nodes) {
    if (JSON.stringify(node.material) !== cle) continue;
    const matrices = node.instances;
    if (!matrices) {
      positions.push(node.position);
      continue;
    }
    for (let index = 0; index < matrices.length; index += 16) {
      positions.push([
        matrices[index + 12] ?? 0,
        matrices[index + 13] ?? 0,
        matrices[index + 14] ?? 0,
      ]);
    }
  }
  return positions;
}

describe('palette du campus', () => {
  it('comporte de vraies valeurs claires, pas seulement de l anthracite', () => {
    const luminances = Object.values(MATERIALS as Record<string, MaterialSpec>).map((material) =>
      luminance(material.color),
    );
    // L ancienne palette plafonnait a 0,15 : aucun contraste n etait possible.
    expect(Math.max(...luminances)).toBeGreaterThan(0.7);
    expect(luminances.filter((valeur) => valeur > 0.5).length).toBeGreaterThanOrEqual(6);
  });

  it('comporte des tons chauds, et pas uniquement des tons bleutes', () => {
    const materiaux = Object.values(MATERIALS as Record<string, MaterialSpec>);
    const chauds = materiaux.filter((material) => chaleur(material.color) > 0.05);
    // Les six materiaux precedents avaient tous le bleu superieur au rouge.
    expect(chauds.length).toBeGreaterThanOrEqual(8);
  });

  it('eclaire le batiment avec au moins une source chaude', () => {
    const chaudes = scene.lights.filter((light) => chaleur(light.color) > 0.05);
    expect(chaudes.length).toBeGreaterThanOrEqual(3);
  });

  it('renvoie de la lumiere vers les surfaces tournees vers le bas', () => {
    const hemispherique = scene.lights.find((light) => light.kind === 'hemisphere');
    expect(hemispherique?.groundColor).toBeDefined();
    // Un rebond quasi noir rendait chaque plafond noir, quelle que soit sa peinture.
    expect(luminance(hemispherique?.groundColor ?? [0, 0, 0])).toBeGreaterThan(0.25);
  });

  it('donne un ciel, pas un vide noir', () => {
    expect(luminance(scene.background)).toBeGreaterThan(0.4);
  });
});

describe('amenagement du campus', () => {
  it('meuble reellement chaque zone', () => {
    for (const zone of CAMPUS_ZONES) {
      const meubles = scene.nodes.filter(
        (node) =>
          dansLaZone(node, zone.id) &&
          !node.id.includes('floor') &&
          !node.id.includes('ceiling') &&
          !node.id.includes('wall'),
      );
      expect(meubles.length, `mobilier dans ${zone.id}`).toBeGreaterThan(0);
    }
  });

  it('distingue les pieces par leur sol, pas par une etiquette', () => {
    const sols = new Set(
      CAMPUS_ZONES.map((zone) => {
        const sol = scene.nodes.find((node) => node.id === `${zone.id}-floor`);
        return JSON.stringify(sol?.material.color);
      }),
    );
    expect(sols.size).toBeGreaterThanOrEqual(5);
  });

  it('ouvre chaque piece sur l exterieur', () => {
    /*
     * Les baies sont regroupees avec les autres surfaces de meme materiau : on
     * les retrouve par leur materiau et leur position, pas par un identifiant.
     */
    const baies = positionsDuMateriau(MATERIALS.vitrageExterieur);
    expect(baies.length).toBeGreaterThanOrEqual(CAMPUS_ZONES.length * 2);
    for (const zone of CAMPUS_ZONES) {
      const versCouloir = zone.doorSide === 'south' ? 1 : -1;
      const zFond = zone.center[2] - versCouloir * (zone.size[1] / 2);
      const surCeMur = baies.filter(
        (position) =>
          Math.abs(position[2] - zFond) < 0.5 &&
          Math.abs(position[0] - zone.center[0]) <= zone.size[0] / 2,
      );
      expect(surCeMur.length, `baies vitrees dans ${zone.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('pose un monde au-dela des murs', () => {
    const dehors = scene.nodes.filter((node) => node.id.startsWith('exterieur-'));
    expect(dehors.length).toBeGreaterThan(0);
  });

  it('cadre chaque piece depuis son seuil, et non depuis le mur d en face', () => {
    for (const zone of CAMPUS_ZONES) {
      const vue = zoneViewpoint(zone);
      const distanceAuCentre = Math.abs(vue.position[2] - zone.center[2]);
      // Le point de vue reste dans l emprise de la piece augmentee du seuil.
      expect(distanceAuCentre, zone.id).toBeLessThanOrEqual(zone.size[1] / 2 + 0.5);
    }
  });
});

describe('cout de rendu', () => {
  it('regroupe les boites de meme materiau au lieu de les multiplier', () => {
    // Le nombre de noeuds est le nombre d appels de rendu : c est lui qui compte.
    expect(scene.nodes.length).toBeLessThan(260);
  });

  it('preserve ce qui doit rester designable', () => {
    // Chaque zone garde son sol, sa porte et sa signaletique designables,
    // auxquels s ajoutent les objets manipulables poses sur le mobilier.
    for (const zone of CAMPUS_ZONES) {
      for (const suffixe of ['floor', 'door', 'sign']) {
        expect(
          scene.nodes.some((node) => node.id === `${zone.id}-${suffixe}`),
          `${zone.id}-${suffixe}`,
        ).toBe(true);
      }
    }
    // Les plafonds sont escamotes par la vue d ensemble, donc jamais fusionnes.
    for (const zone of CAMPUS_ZONES) {
      expect(scene.nodes.some((node) => node.id === `${zone.id}-ceiling`)).toBe(true);
    }
  });

  it('ne regroupe jamais un noeud interactif', () => {
    const nodes: Scene3DNode[] = [
      {
        id: 'porte',
        kind: 'box',
        position: [0, 1, 0],
        size: [1, 2, 0.1],
        material: MATERIALS.murClair,
        static: true,
        interactive: { kind: 'door', targetId: 'z', label: 'Porte' },
      },
      {
        id: 'mur-a',
        kind: 'box',
        position: [2, 1, 0],
        size: [1, 2, 0.1],
        material: MATERIALS.murClair,
        static: true,
      },
      {
        id: 'mur-b',
        kind: 'box',
        position: [4, 1, 0],
        size: [1, 2, 0.1],
        material: MATERIALS.murClair,
        static: true,
      },
    ];
    const compacts = compacter(nodes);
    expect(compacts.some((node) => node.id === 'porte')).toBe(true);
    expect(compacts.filter((node) => node.instances).length).toBe(1);
  });

  it('conserve la position et l echelle de chaque boite regroupee', () => {
    const nodes: Scene3DNode[] = [
      { id: 'a', kind: 'box', position: [1, 2, 3], size: [4, 5, 6], material: MATERIALS.murClair, static: true },
      { id: 'b', kind: 'box', position: [-7, 8, 9], size: [1, 1, 1], material: MATERIALS.murClair, static: true },
    ];
    const compact = compacter(nodes).find((node) => node.instances);
    expect(compact).toBeDefined();
    const matrices = compact?.instances as Float32Array;
    // Colonne majeure : la translation occupe les indices 12 a 14.
    expect([matrices[12], matrices[13], matrices[14]]).toEqual([1, 2, 3]);
    expect([matrices[0], matrices[5], matrices[10]]).toEqual([4, 5, 6]);
    expect([matrices[28], matrices[29], matrices[30]]).toEqual([-7, 8, 9]);
  });
});


describe('interaction contextuelle', () => {
  const manipulables = scene.nodes.filter(
    (node) => node.interactive?.kind === 'workstation' || node.interactive?.kind === 'rack',
  );

  it('pose des objets manipulables dans les pieces ou cela a un sens', () => {
    expect(manipulables.length).toBeGreaterThanOrEqual(6);
    // Chaque objet manipulable annonce le verbe qui sera propose au joueur.
    for (const node of manipulables) {
      expect(node.interactive?.verbe, node.id).toBeTruthy();
    }
    for (const zoneId of ['offices', 'network-room', 'datacenter', 'training-lab']) {
      expect(
        manipulables.some((node) => node.interactive?.targetId === zoneId),
        zoneId,
      ).toBe(true);
    }
  });

  it('ne propose que ce qui est proche et regarde', () => {
    const cible = manipulables[0];
    expect(cible).toBeDefined();
    const position = cible?.position as Vec3;
    const oeil: Vec3 = [position[0], 1.65, position[2] + 1.4];
    // De face et a portee : propose.
    expect(interactionLaPlusProche(scene.nodes, oeil, [0, 0, -1])?.id).toBe(cible?.id);
    // Dos tourne : rien, meme au meme endroit.
    expect(interactionLaPlusProche(scene.nodes, oeil, [0, 0, 1])).toBeUndefined();
    // Trop loin : rien, meme en le regardant.
    const recule: Vec3 = [position[0], 1.65, position[2] + 6];
    expect(interactionLaPlusProche(scene.nodes, recule, [0, 0, -1])).toBeUndefined();
  });

  it('ne propose jamais une porte ni un panneau', () => {
    const portes = scene.nodes.filter((node) => node.interactive?.kind === 'door');
    const porte = portes[0];
    expect(porte).toBeDefined();
    const position = porte?.position as Vec3;
    const devant: Vec3 = [position[0], 1.65, position[2] + 1];
    // Une porte s ouvre au clic ; la proposer aussi a la touche brouillerait le geste.
    const propose = interactionLaPlusProche(scene.nodes, devant, [0, 0, -1]);
    expect(propose?.interactive?.kind).not.toBe('door');
    expect(propose?.interactive?.kind).not.toBe('sign');
  });

  it('depose le visiteur dans la piece, tourne vers son fond', () => {
    for (const zone of CAMPUS_ZONES) {
      const entree = zoneEntryPoint(zone);
      const versCouloir = zone.doorSide === 'south' ? 1 : -1;
      // Le point d entree est a l interieur de l emprise de la piece.
      expect(Math.abs(entree.position[2] - zone.center[2]), zone.id).toBeLessThan(zone.size[1] / 2);
      // Un lacet nul regarde vers les Z croissants : on doit viser le fond.
      const regardZ = Math.cos(entree.yaw);
      expect(Math.sign(regardZ), zone.id).toBe(-versCouloir);
    }
  });
});

describe('reperage sonore et spatial', () => {
  it('sait dans quelle piece se trouve un point donne', () => {
    for (const zone of CAMPUS_ZONES) {
      expect(zoneAt(zone.center)?.id, zone.id).toBe(zone.id);
    }
    // Le couloir n appartient a aucune piece : on n y entend rien de particulier.
    expect(zoneAt([0, 1.65, 0])).toBeUndefined();
  });

  it('associe une ambiance a chaque piece', () => {
    const connues: Ambiance[] = ['accueil', 'bureau', 'technique', 'atelier', 'detente', 'etude'];
    for (const zone of CAMPUS_ZONES) {
      expect(connues, zone.id).toContain(zone.ambiance);
    }
    // Plusieurs ambiances differentes, sinon tout le batiment sonnerait pareil.
    expect(new Set(CAMPUS_ZONES.map((zone) => zone.ambiance)).size).toBeGreaterThanOrEqual(4);
  });
});
