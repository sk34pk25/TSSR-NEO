/*
 * Orchestration du banc d essai des moteurs 3D de TSSR NEO.
 *
 * Chaque moteur construit la meme scene (voir scene-spec.js) et subit la meme
 * charge : rotation de camera, alternance de deux cameras, animation par instance,
 * selection par pointage, habillage pedagogique projete a l ecran.
 */
import { buildThree } from './three-runner.js';
import { buildBabylon } from './babylon-runner.js';
import { expectedObjectCount, overlayAnchors } from './scene-spec.js';

/*
 * Resolution de rendu fixe.
 * La mesure ne doit dependre ni de la taille de la fenetre, ni de la densite de
 * l ecran, ni du fait que le canevas soit visible : sans cela les chiffres ne
 * sont comparables ni entre moteurs ni entre machines.
 */
const RENDER_WIDTH = 1600;
const RENDER_HEIGHT = 900;

const overlay = document.getElementById('overlay');
const results = document.getElementById('results');
const capsBox = document.getElementById('caps');
const measurements = [];

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
    resolutionMesure: `${1600}x${900}`,
    objetsScene: expectedObjectCount(),
  };
}

capsBox.textContent = JSON.stringify(detectCapabilities(), null, 2);

function transferredKb(filter) {
  if (typeof performance.getEntriesByType !== 'function') return 0;
  return (
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes(filter))
      .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0) / 1024
  );
}

function memoryMb() {
  return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : undefined;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/** Habillage pedagogique : trois etiquettes suivant des ancres de la scene. */
function renderOverlay(runner) {
  const anchors = overlayAnchors();
  if (overlay.children.length !== anchors.length) {
    overlay.replaceChildren(
      ...anchors.map((anchor) => {
        const node = document.createElement('div');
        node.className = 'overlay-label';
        node.textContent = anchor.label;
        return node;
      }),
    );
  }
  anchors.forEach((anchor, index) => {
    const node = overlay.children[index];
    try {
      const projected = runner.project(anchor.position);
      node.style.transform = `translate(${Math.round(projected.x)}px, ${Math.round(projected.y)}px)`;
      node.style.opacity = projected.visible ? '1' : '0';
    } catch {
      node.style.opacity = '0';
    }
  });
}

async function runOne({ label, build, mode, seconds }) {
  // Un canevas neuf par mesure : aucun etat residuel entre moteurs.
  // Le noeud est relu a chaque fois : la reference precedente est detachee.
  const previous = document.getElementById('stage');
  const fresh = previous.cloneNode(false);
  previous.replaceWith(fresh);
  const canvas = fresh;
  // Taille imposee en pixels CSS ET en tampon : certains moteurs se
  // redimensionnent seuls sur la taille de mise en page.
  canvas.style.width = `${RENDER_WIDTH}px`;
  canvas.style.height = `${RENDER_HEIGHT}px`;
  canvas.width = RENDER_WIDTH;
  canvas.height = RENDER_HEIGHT;

  const networkBefore = transferredKb(mode === 'babylon' ? 'babylon' : 'three');
  const memoryBefore = memoryMb();
  const startedAt = performance.now();

  const runner = await build({ canvas, mode: mode.includes('webgpu') ? 'webgpu' : 'webgl' });

  // Le temps de demarrage inclut la premiere image reellement soumise au GPU.
  runner.frame(performance.now());
  await runner.flush();
  const startupMs = Math.round(performance.now() - startedAt);
  // Controle de validite : une mesure sur un canevas vide serait rapide et fausse.
  const pixelsRendus = runner.sampleRendered();

  /*
   * Boucle de mesure pilotee par minuterie plutot que par la synchronisation
   * d affichage. La cadence rendue par le compositeur n est pas mesurable de
   * facon fiable ici ; on mesure donc le COUT REEL d une image, GPU compris,
   * en forcant la fin des travaux graphiques apres chaque rendu.
   *
   * La cadence rapportee est donc une cadence theorique hors synchronisation
   * verticale : elle compare les moteurs a charge identique, et n est pas
   * plafonnee a soixante images par seconde.
   */
  const deltas = [];
  let drawCalls = 0;
  const frames = Math.max(60, Math.round(seconds * 30));
  const virtualStep = 1000 / 60;
  for (let i = 0; i < frames; i += 1) {
    const virtualNow = i * virtualStep;
    const before = performance.now();
    runner.frame(virtualNow);
    await runner.flush();
    const cost = performance.now() - before;
    // Les toutes premieres images incluent la compilation des nuanceurs.
    if (i >= 10 && cost > 0 && cost < 2000) deltas.push(cost);
    renderOverlay(runner);
    // Valeur de la derniere image mesuree : un compteur par image, pas un cumul.
    drawCalls = runner.drawCalls();
    if (i % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const average = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
  const memoryAfter = memoryMb();

  const row = {
    label,
    moteur: runner.name,
    backend: runner.backend,
    startupMs,
    fpsMoyen: Math.round(1000 / average),
    frameP50: Math.round(percentile(sorted, 50) * 100) / 100,
    frameP95: Math.round(percentile(sorted, 95) * 100) / 100,
    frameP99: Math.round(percentile(sorted, 99) * 100) / 100,
    fpsBas1: Math.round(1000 / (percentile(sorted, 99) || average)),
    drawCalls,
    objets: runner.objects,
    memoireMo:
      memoryBefore !== undefined && memoryAfter !== undefined
        ? Math.round((memoryAfter - memoryBefore) * 10) / 10
        : undefined,
    reseauKo: Math.round(transferredKb(mode === 'babylon' ? 'babylon' : 'three') - networkBefore),
    images: deltas.length,
    pixelsRendus,
    methode: 'cout image hors synchronisation verticale, GPU vide apres chaque rendu',
  };

  runner.dispose();
  overlay.replaceChildren();
  measurements.push(row);
  appendRow(row);
  return row;
}

function appendRow(row) {
  const tr = document.createElement('tr');
  tr.innerHTML = [
    row.label,
    row.backend,
    row.startupMs,
    row.fpsMoyen,
    row.fpsBas1,
    `${row.frameP50} / ${row.frameP95} / ${row.frameP99}`,
    row.drawCalls,
    row.objets,
    row.memoireMo ?? 'non exposee',
    row.reseauKo,
    row.pixelsRendus,
  ]
    .map((cell) => `<td>${cell}</td>`)
    .join('');
  results.appendChild(tr);
}

function appendError(label, error) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${label}</td><td colspan="9" style="color:#ff5c7a">${String(error)}</td>`;
  results.appendChild(tr);
  measurements.push({ label, erreur: String(error) });
}

const SUITES = {
  'three-webgl': { label: 'Three.js WebGL 2', build: buildThree, mode: 'three' },
  'three-webgpu': { label: 'Three.js WebGPU', build: buildThree, mode: 'three-webgpu' },
  'babylon-webgl': { label: 'Babylon.js WebGL 2', build: buildBabylon, mode: 'babylon' },
  'babylon-webgpu': { label: 'Babylon.js WebGPU', build: buildBabylon, mode: 'babylon-webgpu' },
};

async function run(keys) {
  const buttons = [...document.querySelectorAll('button')];
  for (const button of buttons) button.disabled = true;
  const seconds = Number(document.getElementById('seconds').value);
  for (const key of keys) {
    const suite = SUITES[key];
    try {
      await runOne({ ...suite, seconds });
    } catch (error) {
      appendError(suite.label, error);
    }
  }
  for (const button of buttons) button.disabled = false;
}

document.getElementById('run-all').addEventListener('click', () => void run(Object.keys(SUITES)));
for (const key of Object.keys(SUITES)) {
  document.getElementById(`run-${key}`)?.addEventListener('click', () => void run([key]));
}
document.getElementById('copy').addEventListener('click', () => {
  const payload = {
    capacites: detectCapabilities(),
    mesures: measurements,
    date: new Date().toISOString(),
  };
  void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
});

// Expose les resultats pour une collecte automatisee depuis l exterieur.
window.__TSSR_BENCH__ = { run, measurements, capabilities: detectCapabilities() };
