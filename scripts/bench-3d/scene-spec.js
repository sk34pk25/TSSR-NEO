/*
 * Description de scene partagee par tous les moteurs mesures.
 *
 * Cette scene est representative d une salle reseau TSSR NEO : local technique,
 * baies, serveurs, commutateur, panneau de brassage, cables, poste de travail,
 * eclairage PBR, temoins lumineux animes. Elle est entierement deterministe :
 * chaque moteur construit exactement la meme geometrie, aux memes positions.
 */

/** Generateur pseudo-aleatoire deterministe, identique a celui du Core. */
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROOM = { width: 14, depth: 9, height: 3.2 };
export const RACK_COUNT = 4;
export const SERVERS_PER_RACK = 20;
export const PORTS_PER_PANEL = 24;

export const MATERIALS = {
  floor: { color: [0.13, 0.14, 0.16], metallic: 0.0, roughness: 0.85 },
  wall: { color: [0.18, 0.19, 0.22], metallic: 0.0, roughness: 0.9 },
  rack: { color: [0.09, 0.1, 0.12], metallic: 0.85, roughness: 0.35 },
  server: { color: [0.17, 0.2, 0.24], metallic: 0.75, roughness: 0.42 },
  switchBody: { color: [0.11, 0.16, 0.2], metallic: 0.7, roughness: 0.38 },
  panel: { color: [0.2, 0.2, 0.22], metallic: 0.6, roughness: 0.5 },
  cable: { color: [0.15, 0.5, 0.7], metallic: 0.0, roughness: 0.7 },
  desk: { color: [0.25, 0.21, 0.18], metallic: 0.0, roughness: 0.75 },
  screen: { color: [0.03, 0.05, 0.07], metallic: 0.1, roughness: 0.2 },
};

/** Emplacement des baies, aligne le long du mur du fond. */
export function rackPlacements() {
  const out = [];
  for (let i = 0; i < RACK_COUNT; i += 1) {
    out.push({ x: -4.5 + i * 2.4, y: 0, z: -2.6, width: 0.9, height: 2.1, depth: 1.0 });
  }
  return out;
}

/** Serveurs en baie : c est le gros du travail d instanciation. */
export function serverPlacements() {
  const out = [];
  const racks = rackPlacements();
  for (const [rackIndex, rack] of racks.entries()) {
    for (let u = 0; u < SERVERS_PER_RACK; u += 1) {
      out.push({
        x: rack.x,
        y: 0.22 + u * 0.088,
        z: rack.z,
        rackIndex,
        unit: u,
        width: 0.78,
        height: 0.072,
        depth: 0.82,
      });
    }
  }
  return out;
}

/** Temoins lumineux : un par serveur, animes et donc emissifs. */
export function ledPlacements() {
  return serverPlacements().map((s, index) => ({
    x: s.x + 0.32,
    y: s.y,
    z: s.z + 0.42,
    phase: (index % 17) / 17,
  }));
}

export function switchPlacements() {
  return rackPlacements().map((rack) => ({
    x: rack.x,
    y: 2.02,
    z: rack.z,
    width: 0.78,
    height: 0.07,
    depth: 0.75,
  }));
}

export function panelPlacements() {
  return rackPlacements().map((rack) => ({
    x: rack.x,
    y: 1.92,
    z: rack.z,
    width: 0.78,
    height: 0.06,
    depth: 0.6,
  }));
}

/** Ports du panneau de brassage : petits volumes, forte densite. */
export function portPlacements() {
  const out = [];
  for (const panel of panelPlacements()) {
    for (let p = 0; p < PORTS_PER_PANEL; p += 1) {
      out.push({
        x: panel.x - 0.34 + (p % 12) * 0.062,
        y: panel.y + (p < 12 ? 0.014 : -0.014),
        z: panel.z + 0.3,
        size: 0.028,
      });
    }
  }
  return out;
}

/**
 * Cables de brassage : chaque cable relie un port du panneau a un port du
 * commutateur, par une courbe. C est le cas de geometrie non instanciable
 * le plus couteux de la scene.
 */
export function cableCurves() {
  const out = [];
  const random = rng(1337);
  const panels = panelPlacements();
  const switches = switchPlacements();
  for (const [index, panel] of panels.entries()) {
    const target = switches[index];
    for (let p = 0; p < PORTS_PER_PANEL; p += 1) {
      const startX = panel.x - 0.34 + (p % 12) * 0.062;
      const startY = panel.y + (p < 12 ? 0.014 : -0.014);
      const endX = target.x - 0.34 + (p % 12) * 0.062;
      const sag = 0.06 + random() * 0.09;
      out.push({
        start: [startX, startY, panel.z + 0.32],
        control: [(startX + endX) / 2, startY - sag, panel.z + 0.46 + random() * 0.05],
        end: [endX, target.y - 0.02, target.z + 0.34],
      });
    }
  }
  return out;
}

export function workstation() {
  return {
    desk: { x: 4.2, y: 0.72, z: 1.8, width: 1.6, height: 0.06, depth: 0.8 },
    legs: [
      { x: 3.5, y: 0.36, z: 1.45 },
      { x: 4.9, y: 0.36, z: 1.45 },
      { x: 3.5, y: 0.36, z: 2.15 },
      { x: 4.9, y: 0.36, z: 2.15 },
    ],
    monitor: { x: 4.2, y: 1.05, z: 1.55, width: 0.62, height: 0.38, depth: 0.03 },
    tower: { x: 4.95, y: 0.25, z: 2.05, width: 0.2, height: 0.45, depth: 0.45 },
  };
}

export const LIGHTS = {
  hemisphere: { intensity: 0.55 },
  key: { direction: [-0.4, -1, -0.35], intensity: 1.5, position: [4, 6, 4] },
  points: [
    { position: [-4, 2.9, -1.5], intensity: 12, range: 9 },
    { position: [3.5, 2.9, 1.5], intensity: 10, range: 9 },
  ],
};

/** Ancres de l habillage pedagogique : elles sont projetees a l ecran. */
export function overlayAnchors() {
  const racks = rackPlacements();
  return [
    { id: 'baie-a', label: 'Baie A', position: [racks[0].x, 2.3, racks[0].z] },
    { id: 'baie-d', label: 'Baie D', position: [racks[3].x, 2.3, racks[3].z] },
    { id: 'poste', label: 'Poste technicien', position: [4.2, 1.4, 1.7] },
  ];
}

/** Trajectoires de camera : orbite puis vue subjective, alternees. */
export function cameraAt(mode, timeMs) {
  const t = timeMs / 1000;
  if (mode === 'orbit') {
    const angle = t * 0.35;
    return {
      position: [Math.cos(angle) * 9, 3.4 + Math.sin(t * 0.4) * 0.6, Math.sin(angle) * 9],
      target: [0, 1.4, -1.2],
    };
  }
  // Vue subjective : deplacement le long de l allee technique.
  const walk = Math.sin(t * 0.3) * 3.2;
  return {
    position: [walk, 1.65, 0.6],
    target: [walk * 0.4, 1.5, -2.6],
  };
}

/**
 * Construit un fichier GLB minimal mais valide (boite, materiau PBR).
 * Genere a l execution : le banc ne depend d aucune ressource externe.
 */
export function makeGlb() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    {
      n: [0, 0, 1],
      v: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    },
    {
      n: [0, 1, 0],
      v: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
    },
    {
      n: [1, 0, 0],
      v: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
    },
  ];
  for (const [faceIndex, face] of faces.entries()) {
    for (const vertex of face.v) {
      positions.push(vertex[0] * 0.5, vertex[1] * 0.5, vertex[2] * 0.5);
      normals.push(...face.n);
    }
    const base = faceIndex * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const positionBytes = new Float32Array(positions);
  const normalBytes = new Float32Array(normals);
  const indexBytes = new Uint16Array(indices);
  const pad = (n) => (n + 3) & ~3;

  const positionOffset = 0;
  const normalOffset = pad(positionBytes.byteLength);
  const indexOffset = normalOffset + pad(normalBytes.byteLength);
  const binLength = pad(indexOffset + indexBytes.byteLength);

  const bin = new ArrayBuffer(binLength);
  new Float32Array(bin, positionOffset, positions.length).set(positionBytes);
  new Float32Array(bin, normalOffset, normals.length).set(normalBytes);
  new Uint16Array(bin, indexOffset, indices.length).set(indexBytes);

  const json = {
    asset: { version: '2.0', generator: 'TSSR NEO bench' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'module-glb' }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'pbr-module',
        pbrMetallicRoughness: {
          baseColorFactor: [0.25, 0.55, 0.75, 1],
          metallicFactor: 0.6,
          roughnessFactor: 0.4,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: positionOffset,
        byteLength: positionBytes.byteLength,
        target: 34962,
      },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: binLength }],
  };

  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadded = new Uint8Array(pad(jsonBytes.length)).fill(0x20);
  jsonPadded.set(jsonBytes);

  const total = 12 + 8 + jsonPadded.length + 8 + binLength;
  const glb = new ArrayBuffer(total);
  const view = new DataView(glb);
  const bytes = new Uint8Array(glb);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true); // "glTF"
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, total, true);
  offset += 12;

  view.setUint32(offset, jsonPadded.length, true);
  view.setUint32(offset + 4, 0x4e4f534a, true); // "JSON"
  offset += 8;
  bytes.set(jsonPadded, offset);
  offset += jsonPadded.length;

  view.setUint32(offset, binLength, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN"
  offset += 8;
  bytes.set(new Uint8Array(bin), offset);

  return new Blob([glb], { type: 'model/gltf-binary' });
}

/** Nombre total d objets logiques : sert a verifier que les scenes sont identiques. */
export function expectedObjectCount() {
  return (
    6 + // sol, plafond, quatre murs
    rackPlacements().length +
    serverPlacements().length +
    ledPlacements().length +
    switchPlacements().length +
    panelPlacements().length +
    portPlacements().length +
    cableCurves().length +
    6 + // poste de travail
    1 // module GLB
  );
}
