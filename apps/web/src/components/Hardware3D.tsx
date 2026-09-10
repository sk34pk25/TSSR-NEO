import { useEffect, useRef, useState } from 'react';
import {
  buildDatacenterScene,
  buildHardwareScene,
  hardwarePatches,
  placeRacks,
  type PickHit,
  type QualityProfile,
  type RenderStats,
  type Renderer3D,
} from '@tssr/rendering';
import type { SimulationWorld } from '@tssr/sim-world';
import { useSimValue } from '../state/hooks.ts';

interface Hardware3DProps {
  world: SimulationWorld;
  profile: QualityProfile;
  version: number;
  onChange: () => void;
}

/**
 * Vue materielle en trois dimensions.
 *
 * Tout ce qui est visible vient de l etat de simulation : la couleur d un temoin
 * suit l etat reel du port, un cable affiche est un cable reellement brasse, et
 * le debrancher coupe la liaison reseau pour de bon.
 */
export function Hardware3D({ world, profile, version, onChange }: Hardware3DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | undefined>(undefined);
  const [status, setStatus] = useState<'chargement' | 'pret' | 'indisponible'>('chargement');
  const [selected, setSelected] = useState<PickHit | undefined>(undefined);
  const [stats, setStats] = useState<RenderStats>({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
  });
  const [message, setMessage] = useState<string | undefined>(undefined);

  const scene = useSimValue(version, () => buildDatacenterScene(world.state));
  const layout = useSimValue(version, () => buildHardwareScene(world.state).layout);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    void (async () => {
      try {
        const { ThreeRenderer } = await import('@tssr/rendering/three');
        if (cancelled) return;
        const renderer = new ThreeRenderer(profile, __TSSR_BASE_PATH__);
        await renderer.mount(canvas);
        renderer.setScene(scene);
        // Cadrage sur les baies reellement presentes, pas sur une position figee.
        const racks = placeRacks(world.state);
        const centerX =
          racks.length === 0 ? 0 : racks.reduce((sum, r) => sum + r.origin[0], 0) / racks.length;
        renderer.setCamera({
          mode: 'inspection',
          position: [centerX + 1.1, 1.35, 2.1],
          target: [centerX, 1.0, 0],
          fov: 52,
        });
        renderer.start();
        rendererRef.current = renderer;
        setStatus('pret');
      } catch (error) {
        console.warn('Vue materielle 3D indisponible :', error);
        if (!cancelled) setStatus('indisponible');
      }
    })();
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La scene est reconstruite quand la topologie materielle change ...
  useEffect(() => {
    if (status !== 'pret') return;
    rendererRef.current?.setScene(scene);
  }, [scene, status]);

  // ... et les temoins sont rafraichis a chaque evolution de l etat.
  useEffect(() => {
    if (status !== 'pret') return;
    world.hardware.refreshLeds();
    rendererRef.current?.applyPatches(hardwarePatches(world.state, layout));
  }, [version, status, layout, world]);

  // Telemetrie de rendu relevee periodiquement : une valeur figee au montage
  // ne refleterait que les toutes premieres images.
  useEffect(() => {
    if (status !== 'pret') return undefined;
    const timer = window.setInterval(() => {
      const current = rendererRef.current?.stats();
      if (current) setStats(current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const onResize = (): void => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const asset = useSimValue(version, () =>
    selected?.interactive?.kind === 'asset'
      ? world.hardware.asset(selected.interactive.targetId)
      : undefined,
  );
  const cable =
    selected?.interactive?.kind === 'cable'
      ? world.state.cables.find((c) => c.id === selected.interactive?.targetId)
      : undefined;

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>Materiel</span>
        <span className="neo-dim" style={{ fontWeight: 400 }}>
          {world.state.assets.length} equipements · {world.state.cables.length} cables · {stats.fps}{' '}
          img/s
        </span>
      </div>
      <div className="hardware3d">
        <div className="hardware3d__stage">
          <canvas
            ref={canvasRef}
            className="campus3d__canvas"
            role="img"
            aria-label="Baie de brassage en trois dimensions. La liste des equipements ci-dessous offre les memes actions au clavier."
            onClick={(event) => {
              const hit = rendererRef.current?.pick(event.clientX, event.clientY);
              setSelected(hit);
              setMessage(undefined);
            }}
          />
          {status !== 'pret' ? (
            <div className="campus3d__veil" role="status">
              {status === 'chargement'
                ? 'Chargement de la vue materielle...'
                : 'Rendu 3D indisponible ici. La liste ci-dessous donne les memes actions.'}
            </div>
          ) : null}
          {selected?.interactive ? (
            <div className="campus3d__focus" role="status">
              <strong>{selected.interactive.label}</strong>
              {selected.interactive.description !== undefined ? (
                <span className="neo-muted"> — {selected.interactive.description}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="hardware3d__panel neo-scroll">
          {message !== undefined ? (
            <p className="neo-tag neo-tag--accent" style={{ marginBottom: 8 }}>
              {message}
            </p>
          ) : null}

          {asset ? (
            <div className="neo-stack" style={{ marginBottom: 'var(--neo-space-3)' }}>
              <strong>{asset.assetTag}</strong>
              <span className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                {asset.model} — {asset.location}
              </span>
              <div className="neo-row">
                <button
                  type="button"
                  className="neo-btn neo-btn--sm"
                  onClick={() => {
                    world.hardware.setPower(asset.id, !asset.powered);
                    setMessage(
                      `${asset.assetTag} ${asset.powered ? 'mis hors tension' : 'remis sous tension'}.`,
                    );
                    onChange();
                  }}
                >
                  {asset.powered ? 'Mettre hors tension' : 'Mettre sous tension'}
                </button>
                <span className={`neo-tag ${asset.powered ? 'neo-tag--ok' : 'neo-tag--danger'}`}>
                  {asset.powered ? 'sous tension' : 'hors tension'}
                </span>
              </div>
            </div>
          ) : null}

          {cable ? (
            <div className="neo-stack" style={{ marginBottom: 'var(--neo-space-3)' }}>
              <strong>Cable {cable.id}</strong>
              <span className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                {cable.from.assetId} vers {cable.to.assetId}
              </span>
              <button
                type="button"
                className="neo-btn neo-btn--sm neo-btn--danger"
                onClick={() => {
                  world.hardware.unpatch(cable.id);
                  setMessage(`Cable ${cable.id} retire : la liaison correspondante est coupee.`);
                  setSelected(undefined);
                  onChange();
                }}
              >
                Debrancher
              </button>
            </div>
          ) : null}

          {/* Equivalent accessible : memes informations, memes actions, au clavier. */}
          <table className="neo-table">
            <thead>
              <tr>
                <th>Equipement</th>
                <th>Etat</th>
                <th>Ports actifs</th>
              </tr>
            </thead>
            <tbody>
              {world.state.assets.map((entry) => {
                const lit = entry.ports.filter((p) => p.ledLink !== 'off').length;
                return (
                  <tr key={entry.id}>
                    <td>
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--sm"
                        onClick={() =>
                          setSelected({
                            nodeId: `asset-${entry.id}`,
                            interactive: {
                              kind: 'asset',
                              targetId: entry.id,
                              label: entry.assetTag,
                              description: entry.model,
                            },
                            point: [0, 0, 0],
                            distance: 0,
                          })
                        }
                      >
                        {entry.assetTag}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`neo-tag ${entry.powered ? 'neo-tag--ok' : 'neo-tag--danger'}`}
                      >
                        {entry.powered ? 'actif' : 'hors tension'}
                      </span>
                    </td>
                    <td className="neo-muted">
                      {lit} / {entry.ports.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
