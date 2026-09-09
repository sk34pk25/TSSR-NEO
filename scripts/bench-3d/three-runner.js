/* Construction de la scene de reference avec Three.js. */
import * as SPEC from './scene-spec.js';

function pbr(THREE, spec, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color[0], spec.color[1], spec.color[2]),
    metalness: spec.metallic,
    roughness: spec.roughness,
    ...extra,
  });
}

export async function buildThree({ canvas, mode }) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

  let renderer;
  if (mode === 'webgpu') {
    // Three expose WebGPU par un moteur distinct, avec sa propre API de rendu.
    const WEBGPU = await import('three/webgpu');
    renderer = new WEBGPU.WebGPURenderer({ canvas, antialias: true });
    await renderer.init();
  } else {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  }
  // Rendu a la resolution du tampon du canevas, independamment de la mise en page.
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090d);

  const cameraOrbit = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 120);
  const cameraFirst = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.05, 120);

  scene.add(new THREE.HemisphereLight(0x9db4ff, 0x14181f, SPEC.LIGHTS.hemisphere.intensity));
  const key = new THREE.DirectionalLight(0xffffff, SPEC.LIGHTS.key.intensity);
  key.position.set(...SPEC.LIGHTS.key.position);
  scene.add(key);
  for (const point of SPEC.LIGHTS.points) {
    const light = new THREE.PointLight(0xbfd8ff, point.intensity, point.range);
    light.position.set(...point.position);
    scene.add(light);
  }

  const room = SPEC.ROOM;
  const floorMat = pbr(THREE, SPEC.MATERIALS.floor);
  const wallMat = pbr(THREE, SPEC.MATERIALS.wall);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.1, room.depth), floorMat);
  floor.position.set(0, -0.05, 0);
  scene.add(floor);
  const ceiling = floor.clone();
  ceiling.position.set(0, room.height, 0);
  scene.add(ceiling);
  const wallSpecs = [
    [room.width, room.height, 0.1, 0, room.height / 2, -room.depth / 2],
    [room.width, room.height, 0.1, 0, room.height / 2, room.depth / 2],
    [0.1, room.height, room.depth, -room.width / 2, room.height / 2, 0],
    [0.1, room.height, room.depth, room.width / 2, room.height / 2, 0],
  ];
  for (const [w, h, d, x, y, z] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
  }

  for (const rack of SPEC.rackPlacements()) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(rack.width, rack.height, rack.depth),
      pbr(THREE, SPEC.MATERIALS.rack, { transparent: true, opacity: 0.35 }),
    );
    frame.position.set(rack.x, rack.height / 2, rack.z);
    scene.add(frame);
  }

  // Serveurs : maillage instancie, avec deux niveaux de detail.
  const servers = SPEC.serverPlacements();
  const serverHigh = new THREE.BoxGeometry(0.78, 0.072, 0.82, 2, 1, 2);
  const serverLow = new THREE.BoxGeometry(0.78, 0.072, 0.82);
  const serverMat = pbr(THREE, SPEC.MATERIALS.server);
  const lod = new THREE.LOD();
  const highMesh = new THREE.InstancedMesh(serverHigh, serverMat, servers.length);
  const lowMesh = new THREE.InstancedMesh(serverLow, serverMat, servers.length);
  const matrix = new THREE.Matrix4();
  servers.forEach((s, i) => {
    matrix.makeTranslation(s.x, s.y, s.z);
    highMesh.setMatrixAt(i, matrix);
    lowMesh.setMatrixAt(i, matrix);
  });
  highMesh.instanceMatrix.needsUpdate = true;
  lowMesh.instanceMatrix.needsUpdate = true;
  lod.addLevel(highMesh, 0);
  lod.addLevel(lowMesh, 12);
  scene.add(lod);

  // Temoins lumineux, animes image par image.
  const leds = SPEC.ledPlacements();
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x2effa0,
    emissive: 0x2effa0,
    emissiveIntensity: 1,
  });
  const ledMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.02, 0.014, 0.01),
    ledMat,
    leds.length,
  );
  const ledColor = new THREE.Color();
  leds.forEach((led, i) => {
    matrix.makeTranslation(led.x, led.y, led.z);
    ledMesh.setMatrixAt(i, matrix);
    ledMesh.setColorAt(i, ledColor.setRGB(0.18, 1, 0.63));
  });
  ledMesh.instanceMatrix.needsUpdate = true;
  scene.add(ledMesh);

  const switchMat = pbr(THREE, SPEC.MATERIALS.switchBody);
  for (const sw of SPEC.switchPlacements()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw.width, sw.height, sw.depth), switchMat);
    mesh.position.set(sw.x, sw.y, sw.z);
    scene.add(mesh);
  }
  const panelMat = pbr(THREE, SPEC.MATERIALS.panel);
  for (const panel of SPEC.panelPlacements()) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(panel.width, panel.height, panel.depth),
      panelMat,
    );
    mesh.position.set(panel.x, panel.y, panel.z);
    scene.add(mesh);
  }

  const ports = SPEC.portPlacements();
  const portMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.028, 0.024, 0.02),
    panelMat,
    ports.length,
  );
  ports.forEach((port, i) => {
    matrix.makeTranslation(port.x, port.y, port.z);
    portMesh.setMatrixAt(i, matrix);
  });
  portMesh.instanceMatrix.needsUpdate = true;
  scene.add(portMesh);

  // Cables : geometries individuelles, non instanciables car chaque courbe differe.
  const cableMat = pbr(THREE, SPEC.MATERIALS.cable);
  const cables = SPEC.cableCurves();
  for (const cable of cables) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...cable.start),
      new THREE.Vector3(...cable.control),
      new THREE.Vector3(...cable.end),
    );
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.006, 5, false), cableMat);
    scene.add(mesh);
  }

  const station = SPEC.workstation();
  const deskMat = pbr(THREE, SPEC.MATERIALS.desk);
  const screenMat = pbr(THREE, SPEC.MATERIALS.screen, {
    emissive: 0x0a2233,
    emissiveIntensity: 0.8,
  });
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(station.desk.width, station.desk.height, station.desk.depth),
    deskMat,
  );
  desk.position.set(station.desk.x, station.desk.y, station.desk.z);
  scene.add(desk);
  for (const leg of station.legs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), deskMat);
    mesh.position.set(leg.x, leg.y, leg.z);
    scene.add(mesh);
  }
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(station.monitor.width, station.monitor.height, station.monitor.depth),
    screenMat,
  );
  monitor.position.set(station.monitor.x, station.monitor.y, station.monitor.z);
  scene.add(monitor);
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(station.tower.width, station.tower.height, station.tower.depth),
    pbr(THREE, SPEC.MATERIALS.server),
  );
  tower.position.set(station.tower.x, station.tower.y, station.tower.z);
  scene.add(tower);

  // Chargement GLB reel, depuis un fichier genere a l execution.
  const glbUrl = URL.createObjectURL(SPEC.makeGlb());
  const gltf = await new GLTFLoader().loadAsync(glbUrl);
  gltf.scene.position.set(0, 1.2, 2.6);
  gltf.scene.scale.setScalar(0.6);
  scene.add(gltf.scene);
  URL.revokeObjectURL(glbUrl);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const clock = { lastPick: 0 };

  return {
    name: 'Three.js',
    backend: mode === 'webgpu' ? 'WebGPU' : 'WebGL 2',
    objects: SPEC.expectedObjectCount(),
    project(position) {
      const vector = new THREE.Vector3(...position).project(cameraOrbit);
      return {
        x: (vector.x * 0.5 + 0.5) * canvas.width,
        y: (-vector.y * 0.5 + 0.5) * canvas.height,
        visible: vector.z < 1,
      };
    },
    frame(now) {
      const useOrbit = Math.floor(now / 3000) % 2 === 0;
      const camera = useOrbit ? cameraOrbit : cameraFirst;
      const view = SPEC.cameraAt(useOrbit ? 'orbit' : 'first', now);
      camera.position.set(...view.position);
      camera.lookAt(...view.target);
      lod.update(camera);

      // Animation des temoins : ecriture par instance a chaque image.
      const pulse = (now % 1600) / 1600;
      for (let i = 0; i < leds.length; i += 1) {
        const on = (pulse + leds[i].phase) % 1 < 0.55;
        ledMesh.setColorAt(i, ledColor.setRGB(on ? 0.18 : 0.05, on ? 1 : 0.25, on ? 0.63 : 0.16));
      }
      if (ledMesh.instanceColor) ledMesh.instanceColor.needsUpdate = true;

      if (now - clock.lastPick > 500) {
        clock.lastPick = now;
        raycaster.setFromCamera(pointer, camera);
        raycaster.intersectObjects(scene.children, true);
      }
      renderer.render(scene, camera);
    },
    drawCalls() {
      return renderer.info?.render?.calls ?? 0;
    },
    /**
     * Verifie qu une image reelle a ete produite.
     * Sans ce controle, un canevas vide donnerait des temps excellents et faux.
     */
    sampleRendered() {
      const gl = renderer.getContext?.();
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
      const gl = renderer.getContext?.();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
        return;
      }
      const device = renderer.backend?.device;
      if (device?.queue?.onSubmittedWorkDone) await device.queue.onSubmittedWorkDone();
    },
    dispose() {
      renderer.dispose?.();
    },
  };
}
