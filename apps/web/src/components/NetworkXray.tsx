import { useEffect, useMemo, useRef, useState } from 'react';
import { TopologyRenderer, buildScene, type QualityProfile, type SceneGraph } from '@tssr/rendering';
import type { SimulationWorld } from '@tssr/sim-world';

interface NetworkXrayProps {
  world: SimulationWorld;
  profile: QualityProfile;
  version: number;
  onSelect?: (nodeId: string | undefined) => void;
}

interface FlowState {
  path: string[];
  status: 'delivered' | 'blocked';
  blockedAt: string | undefined;
  info: string;
}

/**
 * Vue reseau pedagogique.
 * Le plan et l etat des liens proviennent de la topologie reelle ;
 * un test de flux affiche le trajet effectivement calcule par le moteur.
 */
export function NetworkXray({ world, profile, version, onSelect }: NetworkXrayProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TopologyRenderer | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flow, setFlow] = useState<FlowState | undefined>(undefined);

  const nodes = useMemo(
    () => world.state.network.nodes.map((n) => ({ id: n.id, hostname: n.hostname })),
    [world, version],
  );

  const scene: SceneGraph = useMemo(() => buildScene(world.state), [world, version]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new TopologyRenderer(profile);
    renderer.mount(canvas);
    renderer.start();
    rendererRef.current = renderer;
    const onResize = (): void => renderer.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      rendererRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setProfile(profile);
  }, [profile]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setScene({
      ...scene,
      flows:
        flow === undefined
          ? []
          : [{ path: flow.path, status: flow.status, blockedAt: flow.blockedAt, label: flow.info }],
    });
    renderer.setSelected(selected);
  }, [scene, flow, selected]);

  function runFlow(): void {
    if (from === '' || to === '') return;
    const target = world.network.node(to);
    const address = target?.interfaces.flatMap((i) => i.addresses)[0]?.address;
    if (address === undefined) {
      setFlow({
        path: [],
        status: 'blocked',
        blockedAt: to,
        info: `${target?.hostname ?? to} n a aucune adresse IP : le test ne peut pas aboutir.`,
      });
      return;
    }
    const result = world.network.reach(from, address);
    const path = result.hops.map((h) => h.nodeId);
    setFlow({
      path,
      status: result.delivered && result.returnOk ? 'delivered' : 'blocked',
      blockedAt: result.failure?.nodeId ?? (result.returnOk ? undefined : path[path.length - 1]),
      info: result.delivered
        ? result.returnOk
          ? `Trajet complet en ${path.length} etape(s), aller-retour ${Math.round(result.latencyMs * 2 * 100) / 100} ms.`
          : `Aller reussi mais aucune route de retour depuis ${target?.hostname ?? to}.`
        : (result.failure?.detail ?? 'destination injoignable'),
    });
  }

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>Vue reseau</span>
        <span className="neo-dim" style={{ fontWeight: 400 }}>
          {scene.nodes.length} equipements, {scene.links.length} liens
        </span>
      </div>
      <div className="xray">
        <div className="neo-row" style={{ padding: '8px 16px', borderBottom: '1px solid var(--neo-border)' }}>
          <label className="neo-visually-hidden" htmlFor="xray-from">
            Source du test de flux
          </label>
          <select
            id="xray-from"
            className="neo-select"
            style={{ width: 'auto' }}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          >
            <option value="">Source...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.hostname}
              </option>
            ))}
          </select>
          <span className="neo-dim">vers</span>
          <label className="neo-visually-hidden" htmlFor="xray-to">
            Destination du test de flux
          </label>
          <select
            id="xray-to"
            className="neo-select"
            style={{ width: 'auto' }}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          >
            <option value="">Destination...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.hostname}
              </option>
            ))}
          </select>
          <button type="button" className="neo-btn neo-btn--sm" onClick={runFlow} disabled={from === '' || to === ''}>
            Tracer le flux
          </button>
          {flow !== undefined ? (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setFlow(undefined)}>
              Effacer
            </button>
          ) : null}
        </div>
        <div className="xray__canvas-wrap">
          <canvas
            ref={canvasRef}
            className="xray__canvas"
            role="img"
            aria-label="Plan interactif du reseau simule"
            onClick={(event) => {
              const pick = rendererRef.current?.pick(event.clientX, event.clientY);
              const id = pick?.kind === 'node' ? pick.id : undefined;
              setSelected(id);
              onSelect?.(id);
            }}
            onMouseMove={(event) => {
              const pick = rendererRef.current?.pick(event.clientX, event.clientY);
              rendererRef.current?.setHovered(pick?.id);
            }}
          />
        </div>
        <div className="xray__legend">
          <span>
            <i className="xray__swatch" style={{ background: 'var(--neo-accent)' }} />
            trunk multi-VLAN
          </span>
          <span>
            <i className="xray__swatch" style={{ background: 'var(--neo-danger)' }} />
            lien coupe
          </span>
          <span>
            <i className="xray__swatch" style={{ background: 'var(--neo-warning)' }} />
            lien degrade
          </span>
          <span>Le bandeau colore d un equipement indique son VLAN.</span>
          {flow !== undefined ? <strong style={{ color: 'var(--neo-text)' }}>{flow.info}</strong> : null}
        </div>
      </div>
    </div>
  );
}
