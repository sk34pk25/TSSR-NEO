/*
 * Banc d essai des moteurs 3D pour TSSR NEO.
 *
 * Scene identique pour chaque moteur :
 *  - une grille d objets instancies representant des equipements en baie ;
 *  - un materiau PBR et deux sources de lumiere ;
 *  - une camera en rotation continue ;
 *  - une selection par pointage a chaque seconde.
 *
 * Mesures : temps d initialisation, cadence moyenne, cadence du centile bas,
 * memoire JavaScript quand le navigateur l expose, et poids reseau charge.
 */

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.169.0/three.module.min.js';
const BABYLON_URL = 'https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.31.2/babylon.js';

const canvas = document.getElementById('stage');
const results = document.getElementById('results');
const caps = document.getElementById('caps');
const rows = [];

function detectCapabilities() {
  const probe = document.createElement('canvas');
  const gl2 = probe.getContext('webgl2');
  const gl = gl2 ?? probe.getContext('webgl');
  let renderer = 'non expose';
  if (gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  return {
    webgpu: 'gpu' in navigator,
    webgl2: gl2 !== null,
    renderer,
    coeurs: navigator.hardwareConcurrency ?? 'non expose',
    memoireGo: navigator.deviceMemory ?? 'non exposee',
    pixelRatio: window.devicePixelRatio,
  };
}

caps.textContent = JSON.stringify(detectCapabilities(), null, 2);

function transferredKb() {
  if (typeof performance.getEntriesByType !== 'function') return 0;
  return (
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('cdnjs'))
      .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0) / 1024
  );
}

function memoryMb() {
  const memory = performance.memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1048576) : undefined;
}

/** Mesure la cadence pendant la duree demandee et renvoie moyenne et centile bas. */
function measure(renderFrame, seconds) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    const loop = (now) => {
      const delta = now - last;
      last = now;
      if (delta > 0) deltas.push(delta);
      renderFrame(now);
      if (now < end) requestAnimationFrame(loop);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const average = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
        const lowIndex = Math.max(0, Math.floor(sorted.length * 0.99) - 1);
        resolve({
          fpsMoyen: Math.round(1000 / average),
          fpsBas: Math.round(1000 / (sorted[lowIndex] ?? average)),
          frames: deltas.length,
        });
      }
    };
    requestAnimationFrame(loop);
  });
}

function record(row) {
  rows.push(row);
  const tr = document.createElement('tr');
  tr.innerHTML = [
    row.moteur,
    row.backend,
    row.initMs,
    row.fpsMoyen,
    row.fpsBas,
    row.objets,
    row.memoireMo ?? 'non exposee',
    row.reseauKo,
  ]
    .map((cell) => `<td>${cell}</td>`)
    .join('');
  results.appendChild(tr);
}

function resetCanvas() {
  const clone = canvas.cloneNode(false);
  canvas.parentNode.replaceChild(clone, canvas);
  return clone;
}

async function benchThree(count, seconds) {
  const before = transferredKb();
  const start = performance.now();
  const THREE = await import(THREE_URL);
  const stage = resetCanvas();
  const renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090d);
  const camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0x88aaff, 0x101418, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(8, 14, 6);
  scene.add(key);

  const geometry = new THREE.BoxGeometry(1.6, 0.25, 0.9);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a3440,
    roughness: 0.45,
    metalness: 0.7,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const perRack = 36;
  for (let i = 0; i < count; i += 1) {
    const rack = Math.floor(i / perRack);
    matrix.makeTranslation(
      (rack % 12) * 2.4 - 14,
      (i % perRack) * 0.3,
      Math.floor(rack / 12) * 4 - 6,
    );
    mesh.setMatrixAt(i, matrix);
  }
  scene.add(mesh);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const initMs = Math.round(performance.now() - start);
  let lastPick = 0;

  const stats = await measure((now) => {
    const angle = now / 4000;
    camera.position.set(Math.cos(angle) * 26, 12, Math.sin(angle) * 26);
    camera.lookAt(0, 5, 0);
    if (now - lastPick > 1000) {
      lastPick = now;
      raycaster.setFromCamera(pointer, camera);
      raycaster.intersectObject(mesh);
    }
    renderer.render(scene, camera);
  }, seconds);

  record({
    moteur: 'Three.js',
    backend: 'WebGL 2',
    initMs,
    objets: count,
    memoireMo: memoryMb(),
    reseauKo: Math.round(transferredKb() - before),
    ...stats,
  });
  renderer.dispose();
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Chargement impossible : ${url}`));
    document.head.appendChild(script);
  });
}

async function benchBabylon(count, seconds) {
  const before = transferredKb();
  const start = performance.now();
  if (typeof window.BABYLON === 'undefined') await loadScript(BABYLON_URL);
  const BABYLON = window.BABYLON;
  const stage = resetCanvas();
  const engine = new BABYLON.Engine(stage, true, { preserveDrawingBuffer: false });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.05, 1);

  const camera = new BABYLON.ArcRotateCamera(
    'cam',
    0,
    1.1,
    30,
    new BABYLON.Vector3(0, 5, 0),
    scene,
  );
  new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.7;
  const key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(-0.6, -1, -0.4), scene);
  key.intensity = 1.4;

  const source = BABYLON.MeshBuilder.CreateBox(
    'unit',
    { width: 1.6, height: 0.25, depth: 0.9 },
    scene,
  );
  const material = new BABYLON.PBRMetallicRoughnessMaterial('pbr', scene);
  material.baseColor = new BABYLON.Color3(0.16, 0.2, 0.25);
  material.metallic = 0.7;
  material.roughness = 0.45;
  source.material = material;

  const perRack = 36;
  const matrices = new Float32Array(count * 16);
  const matrix = BABYLON.Matrix.Identity();
  for (let i = 0; i < count; i += 1) {
    const rack = Math.floor(i / perRack);
    BABYLON.Matrix.TranslationToRef(
      (rack % 12) * 2.4 - 14,
      (i % perRack) * 0.3,
      Math.floor(rack / 12) * 4 - 6,
      matrix,
    );
    matrix.copyToArray(matrices, i * 16);
  }
  source.thinInstanceSetBuffer('matrix', matrices, 16);

  const initMs = Math.round(performance.now() - start);
  let lastPick = 0;

  const stats = await measure((now) => {
    camera.alpha = now / 4000;
    if (now - lastPick > 1000) {
      lastPick = now;
      scene.pick(stage.width / 2, stage.height / 2);
    }
    scene.render();
  }, seconds);

  record({
    moteur: 'Babylon.js',
    backend: engine.webGLVersion === 2 ? 'WebGL 2' : 'WebGL 1',
    initMs,
    objets: count,
    memoireMo: memoryMb(),
    reseauKo: Math.round(transferredKb() - before),
    ...stats,
  });
  engine.dispose();
}

function withBusyButtons(handler) {
  return async () => {
    const buttons = [...document.querySelectorAll('button')];
    for (const button of buttons) button.disabled = true;
    try {
      const count = Number(document.getElementById('count').value);
      const seconds = Number(document.getElementById('seconds').value);
      await handler(count, seconds);
    } catch (error) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="8" style="color:#ff5c7a">${String(error)}</td>`;
      results.appendChild(tr);
    } finally {
      for (const button of buttons) button.disabled = false;
    }
  };
}

document.getElementById('run-three').addEventListener('click', withBusyButtons(benchThree));
document.getElementById('run-babylon').addEventListener('click', withBusyButtons(benchBabylon));
document.getElementById('copy').addEventListener('click', () => {
  const payload = {
    capacites: detectCapabilities(),
    mesures: rows,
    date: new Date().toISOString(),
  };
  void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
});
