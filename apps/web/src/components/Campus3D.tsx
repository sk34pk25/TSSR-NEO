import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMPUS_SPAWN,
  CAMPUS_SPAWN_YAW,
  CAMPUS_ZONES,
  CampusCameraController,
  buildCampusScene,
  inputFromKeys,
  zoneById,
  zoneViewpoint,
  type CameraMode,
  type PickHit,
  type QualityProfile,
  type RenderStats,
  type Renderer3D,
  type Scene3D,
} from '@tssr/rendering';

interface Campus3DProps {
  profile: QualityProfile;
  reduceMotion: boolean;
  /** Les mesures de rendu ne s affichent qu en mode developpeur. */
  developerMode?: boolean;
  highlightZoneIds?: readonly string[];
  onEnterZone: (zoneId: string) => void;
}

/*
 * Deux choix, pas quatre.
 *
 * « Troisieme personne » et « Inspection » restent des modes du controleur,
 * declenches par une interaction (cliquer un equipement cadre l element), mais
 * ils ne sont pas des options a peser : proposer quatre cadrages a quelqu un qui
 * cherche seulement a entrer dans une salle est une charge inutile.
 */
const MODES: { mode: CameraMode; label: string; hint: string }[] = [
  { mode: 'first-person', label: 'Sur place', hint: 'a hauteur des yeux, deplacement libre' },
  { mode: 'tactical', label: 'Plan du site', hint: 'vue d ensemble, plafonds escamotes' },
];

interface Etiquette {
  id: string;
  label: string;
  x: number;
  y: number;
  targetId?: string;
}

/** Distance au-dela de laquelle une etiquette n aide plus, elle encombre. */
const PORTEE_ETIQUETTE = 26;
/** Ecart minimal entre deux etiquettes, en pixels. */
const ECART_MINIMAL = 34;

/**
 * Etiquettes reellement lisibles.
 *
 * Toutes les ancres du campus etaient projetees a chaque image : au bout du
 * couloir, sept etiquettes se superposaient au centre exact du champ de vision
 * en un amas illisible. On ne garde desormais que les zones proches, et on
 * ecarte celles qui se chevauchent, la plus proche gagnant.
 */
function etiquettesVisibles(
  renderer: Renderer3D,
  scene: Scene3D,
  camera: { position: readonly [number, number, number] },
  canvas: HTMLCanvasElement | null,
  mode: CameraMode,
): Etiquette[] {
  const cadre = canvas?.getBoundingClientRect();
  const largeur = cadre?.width ?? 0;
  const hauteur = cadre?.height ?? 0;
  // Le plan d ensemble sert justement a tout nommer : la portee y est levee.
  const portee = mode === 'tactical' ? Number.POSITIVE_INFINITY : PORTEE_ETIQUETTE;

  const candidats = scene.anchors
    .map((anchor) => {
      const dx = anchor.position[0] - camera.position[0];
      const dz = anchor.position[2] - camera.position[2];
      return {
        anchor,
        point: renderer.project(anchor.position),
        distance: Math.hypot(dx, dz),
      };
    })
    .filter(
      (entree) =>
        entree.point.visible &&
        entree.distance <= portee &&
        entree.point.x > 70 &&
        entree.point.x < largeur - 70 &&
        entree.point.y > 10 &&
        entree.point.y < hauteur - 10,
    )
    .sort((a, b) => a.distance - b.distance);

  const retenues: Etiquette[] = [];
  for (const candidat of candidats) {
    const x = Math.round(candidat.point.x);
    const y = Math.round(candidat.point.y);
    const chevauche = retenues.some(
      (autre) => Math.abs(autre.x - x) < 150 && Math.abs(autre.y - y) < ECART_MINIMAL,
    );
    if (chevauche) continue;
    retenues.push({
      id: candidat.anchor.id,
      label: candidat.anchor.label,
      x,
      y,
      ...(candidat.anchor.targetId === undefined ? {} : { targetId: candidat.anchor.targetId }),
    });
  }
  return retenues;
}

/**
 * Campus NEO Systems en trois dimensions.
 *
 * Le moteur graphique est charge paresseusement et n entre jamais dans le
 * paquet initial. En cas d indisponibilite, la liste des zones reste
 * pleinement utilisable : c est l equivalent accessible, pas un lot de consolation.
 */
export function Campus3D({
  profile,
  reduceMotion,
  developerMode = false,
  highlightZoneIds,
  onEnterZone,
}: Campus3DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | undefined>(undefined);
  const controllerRef = useRef<CampusCameraController>(
    new CampusCameraController(CAMPUS_SPAWN, CAMPUS_SPAWN_YAW),
  );
  const pressedRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | undefined>(undefined);
  const draggingRef = useRef(false);

  const [status, setStatus] = useState<'chargement' | 'pret' | 'indisponible'>('chargement');
  // Le premier contact doit etre un lieu, pas un plan.
  const [mode, setMode] = useState<CameraMode>('first-person');
  const [focused, setFocused] = useState<PickHit | undefined>(undefined);
  const modeRef = useRef<CameraMode>('first-person');
  const [stats, setStats] = useState<RenderStats>({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
  });
  const [labels, setLabels] = useState<Etiquette[]>([]);

  const scene: Scene3D = useMemo(
    () => buildCampusScene(highlightZoneIds === undefined ? {} : { highlightZoneIds }),
    [highlightZoneIds],
  );

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    void (async () => {
      try {
        // Import dynamique : le moteur reste hors du paquet initial.
        const { ThreeRenderer } = await import('@tssr/rendering/three');
        if (cancelled) return;
        const renderer = new ThreeRenderer(profile);
        await renderer.mount(canvas);
        renderer.setScene(scene);
        controllerRef.current.setColliders(scene.colliders);
        renderer.setCamera(controllerRef.current.current());
        renderer.start();
        rendererRef.current = renderer;
        setStatus('pret');
      } catch (error) {
        console.warn('Rendu 3D indisponible :', error);
        if (!cancelled) setStatus('indisponible');
      }
    })();

    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
    };
    // La scene est remplacee par un effet dedie ; le montage n a lieu qu une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || status !== 'pret') return;
    renderer.setScene(scene);
    controllerRef.current.setColliders(scene.colliders);
  }, [scene, status]);

  useEffect(() => {
    rendererRef.current?.setQuality(profile);
  }, [profile]);

  // Boucle d entree : deplacement, projection des etiquettes, statistiques.
  useEffect(() => {
    if (status !== 'pret') return undefined;
    let last = performance.now();
    const loop = (now: number): void => {
      const renderer = rendererRef.current;
      if (renderer) {
        const input = inputFromKeys(pressedRef.current);
        const camera = controllerRef.current.update(input, now - last);
        renderer.setCamera(reduceMotion ? { ...camera, transitionMs: 0 } : camera);

        setLabels(etiquettesVisibles(renderer, scene, camera, canvasRef.current, modeRef.current));
        setStats(renderer.stats());
      }
      last = now;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [status, scene, reduceMotion]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      pressedRef.current.add(event.code);
      if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown'].includes(
          event.code,
        )
      ) {
        event.preventDefault();
      }
    };
    const onUp = (event: KeyboardEvent): void => {
      pressedRef.current.delete(event.code);
    };
    const onBlur = (): void => pressedRef.current.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const onResize = (): void => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const changeMode = useCallback((next: CameraMode) => {
    controllerRef.current.setMode(next);
    modeRef.current = next;
    setMode(next);
  }, []);

  /*
   * En vue tactique, les plafonds sont escamotes : sans cela le plan d ensemble
   * ne montrerait que des toitures. C est une consequence du mode de camera,
   * pas un artifice visuel.
   */
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || status !== 'pret') return;
    const ceilings = scene.nodes
      .filter((node) => node.id.endsWith('-ceiling'))
      .map((node) => ({ id: node.id, visible: mode !== 'tactical' }));
    renderer.applyPatches(ceilings);
  }, [mode, scene, status]);

  const enterZone = useCallback(
    (zoneId: string) => {
      const zone = zoneById(zoneId);
      if (!zone) return;
      onEnterZone(zoneId);
    },
    [onEnterZone],
  );

  return (
    <div className="campus3d">
      <div className="campus3d__stage">
        <canvas
          ref={canvasRef}
          className="campus3d__canvas"
          aria-label="Campus NEO Systems en trois dimensions. La liste des zones ci-dessous offre le meme acces au clavier."
          role="img"
          tabIndex={-1}
          onPointerDown={(event) => {
            draggingRef.current = true;
            (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const renderer = rendererRef.current;
            if (!renderer) return;
            if (draggingRef.current) {
              controllerRef.current.update(
                {
                  forward: 0,
                  strafe: 0,
                  yaw: -event.movementX * 0.0035,
                  pitch: -event.movementY * 0.0025,
                  run: false,
                },
                16,
              );
              return;
            }
            const hit = renderer.pick(event.clientX, event.clientY);
            setFocused(hit);
          }}
          onClick={(event) => {
            const hit = rendererRef.current?.pick(event.clientX, event.clientY);
            if (!hit?.interactive) return;
            const { kind, targetId } = hit.interactive;
            if (kind === 'door') {
              enterZone(targetId);
              return;
            }
            const zone = zoneById(targetId);
            if (zone) {
              controllerRef.current.inspect(zoneViewpoint(zone));
              modeRef.current = 'inspection';
              setMode('inspection');
            }
          }}
        />

        {status === 'chargement' ? (
          <div className="campus3d__veil" role="status">
            Chargement du moteur de rendu...
          </div>
        ) : null}
        {status === 'indisponible' ? (
          <div className="campus3d__veil" role="status">
            Le rendu 3D n est pas disponible sur cet appareil. Utilisez la liste des zones
            ci-dessous : elle donne acces exactement aux memes ecrans.
          </div>
        ) : null}

        {status === 'pret' ? (
          <>
            <div className="campus3d__labels" aria-hidden="true">
              {labels.map((label) => (
                <span
                  key={label.id}
                  className="campus3d__label"
                  style={{ transform: `translate(${label.x}px, ${label.y}px)` }}
                >
                  {label.label}
                </span>
              ))}
            </div>

            {focused?.interactive ? (
              <div className="campus3d__focus" role="status">
                <strong>{focused.interactive.label}</strong>
                {focused.interactive.description !== undefined ? (
                  <span className="neo-muted"> — {focused.interactive.description}</span>
                ) : null}
              </div>
            ) : null}

            <div className="campus3d__hud">
              <div className="tabs" role="tablist" aria-label="Mode de camera">
                {MODES.map((entry) => (
                  <button
                    key={entry.mode}
                    type="button"
                    role="tab"
                    aria-selected={mode === entry.mode}
                    title={entry.hint}
                    onClick={() => changeMode(entry.mode)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              {developerMode ? (
                <span className="neo-dim campus3d__stats">
                  {stats.fps} img/s · {stats.drawCalls} appels ·{' '}
                  {Math.round(stats.triangles / 1000)}k triangles
                </span>
              ) : null}
            </div>

            <p className="campus3d__help neo-dim">
              Deplacement : Z Q S D ou les fleches. Maintenir le bouton pour regarder autour.
              Cliquer une porte pour entrer.
            </p>
          </>
        ) : null}
      </div>

      {/*
       * Panneau d orientation. C est a la fois le reperage du visiteur et
       * l equivalent accessible de la vue : toujours dans le document, toujours
       * atteignable au clavier, jamais reduit a un lot de consolation.
       */}
      <nav className="campus3d__wayfinding" aria-label="Zones du campus">
        <h2 className="campus3d__wayfinding-titre">Ou aller</h2>
        <ul className="campus3d__zones">
          {CAMPUS_ZONES.map((zone) => (
            <li key={zone.id}>
              <button
                type="button"
                className="campus3d__zone"
                onClick={() => enterZone(zone.id)}
                onFocus={() => {
                  controllerRef.current.inspect(zoneViewpoint(zone));
                  modeRef.current = 'inspection';
                  setMode('inspection');
                }}
              >
                <span
                  className="campus3d__chip"
                  style={{
                    background: `rgb(${zone.accent.map((c) => Math.round(c * 255)).join(',')})`,
                  }}
                  aria-hidden="true"
                />
                <span className="campus3d__zone-texte">
                  <strong>{zone.name}</strong>
                  <span className="neo-muted">{zone.purpose}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
