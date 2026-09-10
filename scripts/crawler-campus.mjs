/**
 * Detecteur de defauts du campus.
 *
 * Analyse la description de scene plutot que des captures : un personnage
 * enfonce dans un mur, un trou entre deux cloisons ou un objet flottant sont
 * des faits geometriques, verifiables sans oeil humain et sans navigateur.
 */
import { buildCampusScene, CAMPUS_ZONES, zoneEntryPoint, CAMPUS_SPAWN } from '@tssr/rendering';
import { npcs, campusNavigation } from '@tssr/rendering';
import { ASSETS } from '@tssr/rendering';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const scene = buildCampusScene({});
const defauts = [];

function signaler(priorite, lieu, probleme, detail) {
  defauts.push({ priorite, lieu, probleme, detail });
}

/** Un point est-il a l interieur d un volume de collision ? */
function dansUnCollider(point, marge = 0) {
  return scene.colliders.filter(
    (c) =>
      point[0] > c.min[0] - marge &&
      point[0] < c.max[0] + marge &&
      point[2] > c.min[2] - marge &&
      point[2] < c.max[2] + marge &&
      point[1] > c.min[1] - marge &&
      point[1] < c.max[1] + marge,
  );
}

function zoneContenant(point) {
  return CAMPUS_ZONES.find(
    (z) =>
      Math.abs(point[0] - z.center[0]) <= z.size[0] / 2 &&
      Math.abs(point[2] - z.center[2]) <= z.size[1] / 2,
  );
}

const CORRIDOR_HALF = 2.4;
const minX = Math.min(...CAMPUS_ZONES.map((z) => z.center[0] - z.size[0] / 2)) - 1;
const maxX = Math.max(...CAMPUS_ZONES.map((z) => z.center[0] + z.size[0] / 2)) + 1;

function dansLeCouloir(point) {
  return point[0] > minX && point[0] < maxX && Math.abs(point[2]) < CORRIDOR_HALF;
}

// ----------------------------------------------------- 1. personnages

const RAYON_CORPS = 0.28;

/** Le corps occupe un volume : on echantillonne son pourtour, pas son centre. */
function corpsEnCollision(position) {
  const heurts = new Set();
  for (const hauteur of [0.35, 1.0, 1.6]) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const p = [
        position[0] + Math.cos(angle) * RAYON_CORPS,
        hauteur,
        position[2] + Math.sin(angle) * RAYON_CORPS,
      ];
      for (const c of dansUnCollider(p, -0.02)) heurts.add(c.id);
    }
    for (const c of dansUnCollider([position[0], hauteur, position[2]], -0.02)) heurts.add(c.id);
  }
  return [...heurts];
}

/*
 * Un mur est infranchissable ; une chaise ne l est pas.
 *
 * Les volumes de mobilier sont volontairement genereux, pour que le joueur ne
 * vienne pas se coller a un bureau. Y voir une faute pour une personne assise
 * a son poste serait un contresens : ce qu on interdit, c est de traverser la
 * structure du batiment.
 */
const STRUCTUREL = /-col-|-obstacle-mur|corridor-col/;

for (const npc of npcs()) {
  const heurts = corpsEnCollision(npc.position).filter(
    (id) => STRUCTUREL.test(id) || npc.activite !== 'assis',
  );
  if (heurts.length > 0) {
    signaler(
      'P0',
      npc.zoneId,
      `${npc.nom} est a l interieur d une geometrie solide`,
      `position ${npc.position.map((v) => v.toFixed(1))} traverse ${heurts.join(', ')}`,
    );
  }
  const zone = zoneContenant(npc.position);
  if (!zone && !dansLeCouloir(npc.position)) {
    signaler('P0', npc.zoneId, `${npc.nom} est hors du batiment`, `position ${npc.position}`);
  } else if (zone && zone.id !== npc.zoneId) {
    signaler('P1', npc.zoneId, `${npc.nom} est place dans une autre zone`, `se trouve dans ${zone.id}`);
  }

  for (const [index, etape] of (npc.itineraire ?? []).entries()) {
    const point = etape.point;
    if (point[0] === 0 && point[1] === 0 && point[2] === 0) {
      signaler('P0', npc.zoneId, `${npc.nom} : point de passage invalide`, `waypoint ${index} vaut [0, 0, 0]`);
      continue;
    }
    const dedans = dansUnCollider([point[0], 1.2, point[2]], -0.05);
    if (dedans.length > 0) {
      signaler('P0', npc.zoneId, `${npc.nom} : point de passage dans un obstacle`, `waypoint ${index} -> ${dedans[0].id}`);
    }
    if (!zoneContenant(point) && !dansLeCouloir(point)) {
      signaler('P0', npc.zoneId, `${npc.nom} : point de passage hors du batiment`, `waypoint ${index} ${point}`);
    }
  }
}

// -------------------------------- 2. continuite du trajet entre waypoints

/** Echantillonne un segment et signale toute traversee de solide. */
function traverseUnMur(a, b, pas = 0.25) {
  const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const etapes = Math.max(2, Math.ceil(distance / pas));
  for (let i = 0; i <= etapes; i += 1) {
    const t = i / etapes;
    const p = [a[0] + (b[0] - a[0]) * t, 1.2, a[2] + (b[2] - a[2]) * t];
    const dedans = dansUnCollider(p, -0.05);
    if (dedans.length > 0) return { t, obstacle: dedans[0].id, point: p };
  }
  return undefined;
}

/*
 * Le trajet reel n est plus une ligne droite : il est calcule par l espace
 * marchable. On verifie donc le chemin effectivement emprunte, segment par
 * segment, et l on signale aussi une destination devenue inatteignable.
 */
const navigation = campusNavigation();
for (const npc of npcs()) {
  const etapes = npc.itineraire ?? [];
  for (let i = 0; i < etapes.length; i += 1) {
    const a = etapes[i]?.point;
    const b = etapes[(i + 1) % etapes.length]?.point;
    if (!a || !b) continue;
    const chemin = navigation.chemin(a, b);
    if (!chemin) {
      signaler('P0', npc.zoneId, `${npc.nom} : destination inatteignable`, `${etapes[i].nom} -> ${etapes[(i + 1) % etapes.length].nom}`);
      continue;
    }
    for (let j = 0; j < chemin.length - 1; j += 1) {
      const heurt = traverseUnMur(chemin[j], chemin[j + 1]);
      if (heurt) {
        signaler(
          'P0',
          npc.zoneId,
          `${npc.nom} traverse un solide sur son trajet`,
          `${etapes[i].nom} -> ${etapes[(i + 1) % etapes.length].nom}, obstacle ${heurt.obstacle}`,
        );
        break;
      }
    }
  }
}

// ------------------------------------------- 3. enveloppes : trous de murs

/**
 * Une piece doit etre fermee : on tire des rayons depuis son centre vers
 * l exterieur et l on verifie qu un volume de collision les arrete.
 */
/**
 * Une piece doit etre fermee sur trois cotes. On longe chaque mur et l on tire,
 * tous les trente centimetres et a trois hauteurs, un rayon vers l exterieur :
 * un rayon qui sort sans rencontrer de solide designe un trou.
 */
function sonderMur(zone, cote) {
  const [cx, , cz] = zone.center;
  const [largeur, profondeur] = zone.size;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const trous = [];

  const points = [];
  if (cote === 'gauche' || cote === 'droit') {
    const signe = cote === 'gauche' ? -1 : 1;
    for (let d = -profondeur / 2 + 0.4; d <= profondeur / 2 - 0.4; d += 0.3) {
      points.push({ depart: [cx + signe * (largeur / 2 - 0.5), cz + d], direction: [signe, 0] });
    }
  } else {
    const zFond = cz - versCouloir * (profondeur / 2);
    for (let d = -largeur / 2 + 0.4; d <= largeur / 2 - 0.4; d += 0.3) {
      points.push({ depart: [cx + d, zFond + versCouloir * 0.5], direction: [0, -versCouloir] });
    }
  }

  for (const { depart, direction } of points) {
    for (const hauteur of [0.4, 1.4, 2.6]) {
      let bloque = false;
      for (let distance = 0; distance < 2.2; distance += 0.08) {
        const p = [depart[0] + direction[0] * distance, hauteur, depart[1] + direction[1] * distance];
        if (dansUnCollider(p, 0).length > 0) {
          bloque = true;
          break;
        }
      }
      if (!bloque) trous.push({ depart, hauteur });
    }
  }
  return trous;
}

for (const zone of CAMPUS_ZONES) {
  for (const cote of ['gauche', 'droit', 'fond']) {
    const trous = sonderMur(zone, cote);
    if (trous.length > 0) {
      const premier = trous[0];
      signaler(
        'P0',
        zone.id,
        `mur ${cote} : ${trous.length} rayon(s) sortent sans rencontrer de solide`,
        `premier trou vers x=${premier.depart[0].toFixed(1)} z=${premier.depart[1].toFixed(1)} a ${premier.hauteur} m`,
      );
    }
  }
}

// Le couloir doit lui aussi etre ferme sur ses deux pignons.
for (const [nom, x, direction] of [
  ['pignon ouest', minX + 0.5, -1],
  ['pignon est', maxX - 0.5, 1],
]) {
  let trous = 0;
  for (let z = -CORRIDOR_HALF + 0.3; z <= CORRIDOR_HALF - 0.3; z += 0.3) {
    for (const hauteur of [0.4, 1.4, 2.6]) {
      let bloque = false;
      for (let d = 0; d < 2; d += 0.08) {
        if (dansUnCollider([x + direction * d, hauteur, z], 0).length > 0) {
          bloque = true;
          break;
        }
      }
      if (!bloque) trous += 1;
    }
  }
  if (trous > 0) signaler('P0', 'couloir', `${nom} : ${trous} rayon(s) sortent sans obstacle`, 'pignon ouvert');
}

// --------------------------------------------- 4. points de depart valides

const departs = [{ nom: 'apparition', point: CAMPUS_SPAWN }];
for (const zone of CAMPUS_ZONES) {
  departs.push({ nom: `entree ${zone.id}`, point: zoneEntryPoint(zone).position });
}
for (const depart of departs) {
  const dedans = dansUnCollider([depart.point[0], 1.2, depart.point[2]], -0.05);
  if (dedans.length > 0) {
    signaler('P0', depart.nom, 'point de depart a l interieur d un solide', dedans.map((d) => d.id).join(', '));
  }
}

// ----------------------------- 5. circulation depuis chaque porte

/*
 * L axe de chaque porte doit rester degage, et ce qu on vient manipuler dans
 * la piece doit se trouver a portee depuis cette allee. Le mobilier barrait
 * l entree de quatre pieces : on y butait des le premier pas.
 */
for (const zone of CAMPUS_ZONES) {
  const entree = zoneEntryPoint(zone);
  // Selon l axe de la porte, pas selon le regard : on arrive tourne vers
  // l equipement de la piece.
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const direction = [0, 0, -versCouloir];
  let libre = 0;
  for (let distance = 0; distance < 9; distance += 0.1) {
    const point = [
      entree.position[0] + direction[0] * distance,
      0,
      entree.position[2] + direction[2] * distance,
    ];
    if (!navigation.estMarchable(point)) break;
    libre = distance;
  }
  if (libre < 2.5) {
    signaler('P0', zone.id, 'l axe de la porte est barre', `allee libre de ${libre.toFixed(1)} m seulement`);
  }

  const manipulables = scene.nodes.filter(
    (node) =>
      node.id.startsWith(zone.id) &&
      (node.interactive?.kind === 'rack' || node.interactive?.kind === 'workstation'),
  );
  if (manipulables.length === 0) continue;
  const meilleure = Math.min(
    ...manipulables.map((node) => {
      let plusProche = Number.POSITIVE_INFINITY;
      for (let distance = 0; distance <= libre; distance += 0.1) {
        const point = [
          entree.position[0] + direction[0] * distance,
          0,
          entree.position[2] + direction[2] * distance,
        ];
        plusProche = Math.min(
          plusProche,
          Math.hypot(node.position[0] - point[0], node.position[2] - point[2]),
        );
      }
      return plusProche;
    }),
  );
  if (meilleure > 2.6) {
    signaler(
      'P0',
      zone.id,
      'aucun objet manipulable a portee depuis l allee',
      `le plus proche est a ${meilleure.toFixed(2)} m`,
    );
  }
}

// ------------------------------------------------ 6. objets sous le sol

for (const node of scene.nodes) {
  const matrices = node.instances;
  const positions = matrices
    ? Array.from({ length: matrices.length / 16 }, (_, i) => [
        matrices[i * 16 + 12],
        matrices[i * 16 + 13],
        matrices[i * 16 + 14],
      ])
    : [node.position];
  for (const p of positions) {
    if (p[1] < -0.4 && !node.id.startsWith('exterieur')) {
      signaler('P2', node.id, 'objet sous le niveau du sol', `y = ${p[1].toFixed(2)}`);
      break;
    }
  }
}

// --------------------------------------------------- 7. assets manquants

const RACINE = resolve(process.cwd(), 'assets/3d');
for (const asset of ASSETS) {
  if (!existsSync(resolve(RACINE, asset.fichier))) {
    signaler('P0', asset.id, 'fichier de modele manquant', asset.fichier);
  }
}
const declares = new Set(ASSETS.map((a) => a.id));
for (const node of scene.nodes) {
  if (node.model && !declares.has(node.model.assetId)) {
    signaler('P0', node.id, 'modele non declare dans le registre', node.model.assetId);
  }
}

// ---------------------------------------------------------- 8. rapport

const ordre = { P0: 0, P1: 1, P2: 2 };
defauts.sort((a, b) => ordre[a.priorite] - ordre[b.priorite]);
for (const d of defauts) {
  console.log(`${d.priorite}  ${d.lieu.padEnd(16)} ${d.probleme}\n      ${d.detail}`);
}
console.log(
  `\n${defauts.length} defaut(s) : ` +
    ['P0', 'P1', 'P2'].map((p) => `${p}=${defauts.filter((d) => d.priorite === p).length}`).join(', '),
);
