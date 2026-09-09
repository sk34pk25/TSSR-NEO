/* Construction de la meme scene de reference avec Babylon.js. */
import * as SPEC from './scene-spec.js';

const BABYLON_BASE = 'https://cdn.jsdelivr.net/npm/babylonjs@7.31.2';
const LOADERS_BASE = 'https://cdn.jsdelivr.net/npm/babylonjs-loaders@7.31.2';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Chargement impossible : ${url}`));
    document.head.appendChild(script);
  });
}

function pbr(BABYLON, scene, name, spec, extra = {}) {
  const material = new BABYLON.PBRMetallicRoughnessMaterial(name, scene);
  material.baseColor = new BABYLON.Color3(spec.color[0], spec.color[1], spec.color[2]);
  material.metallic = spec.metallic;
  material.roughness = spec.roughness;
  Object.assign(material, extra);
  return material;
}

function box(BABYLON, scene, name, size, position, material) {
  const mesh = BABYLON.MeshBuilder.CreateBox(name, size, scene);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.material = material;
  return mesh;
}

export async function buildBabylon({ canvas, mode }) {
  await loadScript(`${BABYLON_BASE}/babylon.js`);
  await loadScript(`${LOADERS_BASE}/babylonjs.loaders.min.js`);
  const BABYLON = window.BABYLON;

  let engine;
  if (mode === 'webgpu') {
    engine = new BABYLON.WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
  } else {
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false });
  }

  // Meme resolution de rendu que les autres moteurs mesures.
  engine.setSize(canvas.width, canvas.height);

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.024, 0.035, 0.051, 1);

  const cameraOrbit = new BABYLON.UniversalCamera('orbit', new BABYLON.Vector3(9, 3.4, 9), scene);
  const cameraFirst = new BABYLON.UniversalCamera(
    'first',
    new BABYLON.Vector3(0, 1.65, 0.6),
    scene,
  );
  cameraOrbit.fov = 0.96;
  cameraFirst.fov = 1.22;
  scene.activeCamera = cameraOrbit;

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = SPEC.LIGHTS.hemisphere.intensity;
  const key = new BABYLON.DirectionalLight(
    'key',
    new BABYLON.Vector3(...SPEC.LIGHTS.key.direction),
    scene,
  );
  key.intensity = SPEC.LIGHTS.key.intensity;
  key.position = new BABYLON.Vector3(...SPEC.LIGHTS.key.position);
  for (const [index, point] of SPEC.LIGHTS.points.entries()) {
    const light = new BABYLON.PointLight(
      `point-${index}`,
      new BABYLON.Vector3(...point.position),
      scene,
    );
    light.intensity = point.intensity;
    light.range = point.range;
  }

  const room = SPEC.ROOM;
  const floorMat = pbr(BABYLON, scene, 'floor', SPEC.MATERIALS.floor);
  const wallMat = pbr(BABYLON, scene, 'wall', SPEC.MATERIALS.wall);
  box(
    BABYLON,
    scene,
    'floor',
    { width: room.width, height: 0.1, depth: room.depth },
    [0, -0.05, 0],
    floorMat,
  );
  box(
    BABYLON,
    scene,
    'ceiling',
    { width: room.width, height: 0.1, depth: room.depth },
    [0, room.height, 0],
    floorMat,
  );
  const wallSpecs = [
    [{ width: room.width, height: room.height, depth: 0.1 }, [0, room.height / 2, -room.depth / 2]],
    [{ width: room.width, height: room.height, depth: 0.1 }, [0, room.height / 2, room.depth / 2]],
    [{ width: 0.1, height: room.height, depth: room.depth }, [-room.width / 2, room.height / 2, 0]],
    [{ width: 0.1, height: room.height, depth: room.depth }, [room.width / 2, room.height / 2, 0]],
  ];
  for (const [size, position] of wallSpecs) box(BABYLON, scene, 'wall', size, position, wallMat);

  const rackMat = pbr(BABYLON, scene, 'rack', SPEC.MATERIALS.rack, { alpha: 0.35 });
  for (const rack of SPEC.rackPlacements()) {
    box(
      BABYLON,
      scene,
      'rack',
      { width: rack.width, height: rack.height, depth: rack.depth },
      [rack.x, rack.height / 2, rack.z],
      rackMat,
    );
  }

  // Serveurs : instances fines, avec deux niveaux de detail.
  const servers = SPEC.serverPlacements();
  const serverMat = pbr(BABYLON, scene, 'server', SPEC.MATERIALS.server);
  const serverSource = BABYLON.MeshBuilder.CreateBox(
    'server',
    { width: 0.78, height: 0.072, depth: 0.82 },
    scene,
  );
  serverSource.material = serverMat;
  const serverLow = BABYLON.MeshBuilder.CreateBox(
    'server-low',
    { width: 0.78, height: 0.072, depth: 0.82 },
    scene,
  );
  serverLow.material = serverMat;
  serverSource.addLODLevel(12, serverLow);

  const serverMatrices = new Float32Array(servers.length * 16);
  const scratch = BABYLON.Matrix.Identity();
  servers.forEach((s, i) => {
    BABYLON.Matrix.TranslationToRef(s.x, s.y, s.z, scratch);
    scratch.copyToArray(serverMatrices, i * 16);
  });
  serverSource.thinInstanceSetBuffer('matrix', serverMatrices, 16);

  // Temoins lumineux : couleur par instance, reecrite a chaque image.
  const leds = SPEC.ledPlacements();
  const ledMat = new BABYLON.PBRMetallicRoughnessMaterial('led', scene);
  ledMat.baseColor = new BABYLON.Color3(0.18, 1, 0.63);
  ledMat.emissiveColor = new BABYLON.Color3(0.18, 1, 0.63);
  const ledSource = BABYLON.MeshBuilder.CreateBox(
    'led',
    { width: 0.02, height: 0.014, depth: 0.01 },
    scene,
  );
  ledSource.material = ledMat;
  const ledMatrices = new Float32Array(leds.length * 16);
  const ledColors = new Float32Array(leds.length * 4);
  leds.forEach((led, i) => {
    BABYLON.Matrix.TranslationToRef(led.x, led.y, led.z, scratch);
    scratch.copyToArray(ledMatrices, i * 16);
    ledColors.set([0.18, 1, 0.63, 1], i * 4);
  });
  ledSource.thinInstanceSetBuffer('matrix', ledMatrices, 16);
  ledSource.thinInstanceSetBuffer('color', ledColors, 4);

  const switchMat = pbr(BABYLON, scene, 'switch', SPEC.MATERIALS.switchBody);
  for (const sw of SPEC.switchPlacements()) {
    box(
      BABYLON,
      scene,
      'switch',
      { width: sw.width, height: sw.height, depth: sw.depth },
      [sw.x, sw.y, sw.z],
      switchMat,
    );
  }
  const panelMat = pbr(BABYLON, scene, 'panel', SPEC.MATERIALS.panel);
  for (const panel of SPEC.panelPlacements()) {
    box(
      BABYLON,
      scene,
      'panel',
      { width: panel.width, height: panel.height, depth: panel.depth },
      [panel.x, panel.y, panel.z],
      panelMat,
    );
  }

  const ports = SPEC.portPlacements();
  const portSource = BABYLON.MeshBuilder.CreateBox(
    'port',
    { width: 0.028, height: 0.024, depth: 0.02 },
    scene,
  );
  portSource.material = panelMat;
  const portMatrices = new Float32Array(ports.length * 16);
  ports.forEach((port, i) => {
    BABYLON.Matrix.TranslationToRef(port.x, port.y, port.z, scratch);
    scratch.copyToArray(portMatrices, i * 16);
  });
  portSource.thinInstanceSetBuffer('matrix', portMatrices, 16);

  const cableMat = pbr(BABYLON, scene, 'cable', SPEC.MATERIALS.cable);
  for (const [index, cable] of SPEC.cableCurves().entries()) {
    const curve = BABYLON.Curve3.CreateQuadraticBezier(
      new BABYLON.Vector3(...cable.start),
      new BABYLON.Vector3(...cable.control),
      new BABYLON.Vector3(...cable.end),
      10,
    );
    const tube = BABYLON.MeshBuilder.CreateTube(
      `cable-${index}`,
      { path: curve.getPoints(), radius: 0.006, tessellation: 5, updatable: false },
      scene,
    );
    tube.material = cableMat;
  }

  const station = SPEC.workstation();
  const deskMat = pbr(BABYLON, scene, 'desk', SPEC.MATERIALS.desk);
  const screenMat = pbr(BABYLON, scene, 'screen', SPEC.MATERIALS.screen, {
    emissiveColor: new BABYLON.Color3(0.04, 0.13, 0.2),
  });
  box(
    BABYLON,
    scene,
    'desk',
    { width: station.desk.width, height: station.desk.height, depth: station.desk.depth },
    [station.desk.x, station.desk.y, station.desk.z],
    deskMat,
  );
  for (const leg of station.legs) {
    box(
      BABYLON,
      scene,
      'leg',
      { width: 0.06, height: 0.72, depth: 0.06 },
      [leg.x, leg.y, leg.z],
      deskMat,
    );
  }
  box(
    BABYLON,
    scene,
    'monitor',
    { width: station.monitor.width, height: station.monitor.height, depth: station.monitor.depth },
    [station.monitor.x, station.monitor.y, station.monitor.z],
    screenMat,
  );
  box(
    BABYLON,
    scene,
    'tower',
    { width: station.tower.width, height: station.tower.height, depth: station.tower.depth },
    [station.tower.x, station.tower.y, station.tower.z],
    serverMat,
  );

  // Chargement GLB reel, depuis le meme fichier genere que pour Three.js.
  const glbUrl = URL.createObjectURL(SPEC.makeGlb());
  const imported = await BABYLON.SceneLoader.ImportMeshAsync(
    '',
    glbUrl,
    '',
    scene,
    undefined,
    '.glb',
  );
  for (const mesh of imported.meshes) {
    if (!mesh.parent) {
      mesh.position = new BABYLON.Vector3(0, 1.2, 2.6);
      mesh.scaling = new BABYLON.Vector3(0.6, 0.6, 0.6);
    }
  }
  URL.revokeObjectURL(glbUrl);

  const instrumentation = new BABYLON.EngineInstrumentation(engine);
  instrumentation.captureGPUFrameTime = false;
  let lastPick = 0;
  // Le compteur interne de Babylon cumule sur toute la session : on en prend
  // la difference d une image a l autre pour obtenir une valeur par image,
  // comparable a celle exposee par Three.js.
  let previousDrawCalls = 0;

  return {
    name: 'Babylon.js',
    backend: mode === 'webgpu' ? 'WebGPU' : engine.webGLVersion === 2 ? 'WebGL 2' : 'WebGL 1',
    objects: SPEC.expectedObjectCount(),
    project(position) {
      const vector = BABYLON.Vector3.Project(
        new BABYLON.Vector3(...position),
        BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
      );
      return { x: vector.x, y: vector.y, visible: vector.z < 1 };
    },
    frame(now) {
      const useOrbit = Math.floor(now / 3000) % 2 === 0;
      const camera = useOrbit ? cameraOrbit : cameraFirst;
      scene.activeCamera = camera;
      const view = SPEC.cameraAt(useOrbit ? 'orbit' : 'first', now);
      camera.position.set(view.position[0], view.position[1], view.position[2]);
      camera.setTarget(new BABYLON.Vector3(view.target[0], view.target[1], view.target[2]));

      const pulse = (now % 1600) / 1600;
      for (let i = 0; i < leds.length; i += 1) {
        const on = (pulse + leds[i].phase) % 1 < 0.55;
        ledColors.set(on ? [0.18, 1, 0.63, 1] : [0.05, 0.25, 0.16, 1], i * 4);
      }
      ledSource.thinInstanceSetBuffer('color', ledColors, 4);

      if (now - lastPick > 500) {
        lastPick = now;
        scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
      }
      scene.render();
    },
    drawCalls() {
      const cumulative =
        engine._drawCalls?.current ?? instrumentation.drawCallsCounter?.current ?? 0;
      const perFrame = cumulative - previousDrawCalls;
      previousDrawCalls = cumulative;
      return perFrame > 0 ? perFrame : 0;
    },
    /**
     * Verifie qu une image reelle a ete produite.
     * Sans ce controle, un canevas vide donnerait des temps excellents et faux.
     */
    sampleRendered() {
      const gl = engine._gl;
      if (!gl || typeof gl.readPixels !== 'function') return 'non verifiable (WebGPU)';
      const size = 24;
      const pixels = new Uint8Array(size * size * 4);
      gl.readPixels(
        Math.floor(canvas.width / 2) - size / 2,
        Math.floor(canvas.height / 2) - size / 2,
        size,
        size,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 24) lit += 1;
      }
      return lit;
    },
    /** Attend la fin reelle des travaux graphiques, pour mesurer le cout GPU. */
    async flush() {
      const gl = engine._gl;
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
        return;
      }
      const device = engine._device;
      if (device?.queue?.onSubmittedWorkDone) await device.queue.onSubmittedWorkDone();
    },
    dispose() {
      instrumentation.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
