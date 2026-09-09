import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { SwitchConsole } from '@tssr/sim-network';
import { scoreLabel } from '@tssr/evaluation';
import { NetworkXray } from '../components/NetworkXray.tsx';
import {
  MonitoringPanel,
  NovaPanel,
  ObjectivesPanel,
  TicketsPanel,
} from '../components/MissionPanels.tsx';
import {
  TerminalPanel,
  switchConsoleAdapter,
  terminalAdapter,
} from '../components/TerminalPanel.tsx';
import { navigate, useSession, useSimValue } from '../state/hooks.ts';

// La vue materielle embarque le moteur 3D : elle est chargee a la demande.
const Hardware3D = lazy(() =>
  import('../components/Hardware3D.tsx').then((module) => ({ default: module.Hardware3D })),
);

type CenterTab = 'terminal' | 'console' | 'materiel';
type SideTab = 'nova' | 'tickets' | 'supervision';

/** Ecran de mission : simulation, diagnostic et suivi au meme endroit. */
export function MissionView(): JSX.Element {
  const session = useSession();
  const [version, setVersion] = useState(0);
  const [centerTab, setCenterTab] = useState<CenterTab>('terminal');
  const [sideTab, setSideTab] = useState<SideTab>('nova');
  const [machineChoice, setMachineChoice] = useState<string>('');
  const [switchChoice, setSwitchChoice] = useState<string>('');
  const [debrief, setDebrief] = useState<ReturnType<typeof scoreLabel> | undefined>(undefined);

  const world = session.world;
  const runner = session.runner;

  const machines = useSimValue(version, () => world?.state.systems ?? []);
  const switches = useSimValue(
    version,
    () =>
      world?.state.network.nodes.filter((n) => n.kind === 'switch' || n.kind === 'router') ?? [],
  );

  /*
   * La cible courante est **derivee** : tant que rien n est choisi, c est le
   * premier element disponible. Synchroniser cela par un effet provoquerait un
   * rendu en cascade et un ecran vide au premier passage.
   */
  const machineId = machineChoice !== '' ? machineChoice : (machines[0]?.id ?? '');
  const switchId = switchChoice !== '' ? switchChoice : (switches[0]?.id ?? '');

  const terminal = useMemo(() => {
    if (!world || machineId === '') return undefined;
    const created = world.terminal(machineId);
    return created ? terminalAdapter(created) : undefined;
  }, [world, machineId]);

  const switchConsole = useMemo(() => {
    if (!world || switchId === '') return undefined;
    return switchConsoleAdapter(new SwitchConsole(world.network, switchId, { bus: world.bus }));
  }, [world, switchId]);

  function refresh(): void {
    session.tick();
    setVersion((v) => v + 1);
  }

  useEffect(() => {
    if (
      runner &&
      (runner.state.status === 'succeeded' || runner.state.status === 'failed') &&
      debrief === undefined
    ) {
      void session.completeMission().then(() => setDebrief(scoreLabel(runner.score().overall)));
    }
  }, [runner, runner?.state.status, debrief, session]);

  if (!world) {
    return (
      <div className="neo-card">
        <h2>Aucune mission en cours</h2>
        <p className="neo-muted">
          Choisissez un cours depuis le campus, ou ouvrez le laboratoire libre pour manipuler sans
          objectif impose.
        </p>
        <div className="neo-row">
          <button
            type="button"
            className="neo-btn neo-btn--primary"
            onClick={() => navigate('campus')}
          >
            Aller au campus
          </button>
          <button
            type="button"
            className="neo-btn"
            onClick={() => {
              session.startFreeLab();
              navigate('laboratoire');
            }}
          >
            Laboratoire libre
          </button>
        </div>
      </div>
    );
  }

  const summary = runner?.summary();

  return (
    <div className="mission-layout">
      <aside className="neo-stack" style={{ minHeight: 0, overflow: 'auto' }}>
        {runner ? (
          <>
            <div className="neo-panel">
              <div className="neo-panel__head">
                <span>Mission</span>
                <span className="neo-tag">{runner.state.difficulty}</span>
              </div>
              <div className="neo-panel__body">
                <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>{summary?.title}</h3>
                <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                  {typeof runner.definition.briefing === 'string' ? runner.definition.briefing : ''}
                </p>
                <div className="neo-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--sm"
                    onClick={() => session.advanceTime(5)}
                  >
                    Avancer de 5 min
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--sm"
                    onClick={() =>
                      void session.takeSnapshot(
                        `Avant intervention ${new Date().toLocaleTimeString('fr-FR')}`,
                      )
                    }
                  >
                    Instantane
                  </button>
                </div>
              </div>
            </div>
            <ObjectivesPanel runner={runner} version={version} />
          </>
        ) : (
          <div className="neo-panel">
            <div className="neo-panel__head">Laboratoire libre</div>
            <div className="neo-panel__body neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
              Aucun objectif impose. Fixez-vous un etat cible et verifiez-le avec la vue reseau ou
              le terminal.
            </div>
          </div>
        )}

        {debrief !== undefined && runner ? (
          <div className="neo-panel">
            <div className="neo-panel__head">
              <span>Debrief</span>
              <span className="neo-tag neo-tag--accent">{debrief}</span>
            </div>
            <div className="neo-panel__body neo-scroll">
              <dl className="kv">
                {Object.entries(runner.score().dimensions).map(([key, value]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <dt>{key}</dt>
                    <dd>{Math.round((value as number) * 100)} %</dd>
                  </div>
                ))}
              </dl>
              <h3 style={{ fontSize: 'var(--neo-fs-md)', marginTop: 'var(--neo-space-4)' }}>
                Points cles
              </h3>
              <ul style={{ paddingLeft: 18 }}>
                {summary?.keyPoints.map((point) => (
                  <li key={point} className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                    {point}
                  </li>
                ))}
              </ul>
              <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Strategies possibles</h3>
              {summary?.alternatives.map((alternative) => (
                <div key={alternative.id} className="nova-message" style={{ marginBottom: 8 }}>
                  <strong>{typeof alternative.label === 'string' ? alternative.label : ''}</strong>
                  <div className="neo-row" style={{ gap: 6, margin: '4px 0' }}>
                    <span
                      className={`neo-tag ${alternative.worksTechnically ? 'neo-tag--ok' : 'neo-tag--danger'}`}
                    >
                      {alternative.worksTechnically ? 'fonctionne' : 'ne fonctionne pas'}
                    </span>
                    <span
                      className={`neo-tag ${alternative.professionallySound ? 'neo-tag--ok' : 'neo-tag--warn'}`}
                    >
                      {alternative.professionallySound
                        ? 'bonne pratique'
                        : 'a eviter en production'}
                    </span>
                  </div>
                  <span className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                    {typeof alternative.explanation === 'string' ? alternative.explanation : ''}
                  </span>
                </div>
              ))}
              <button
                type="button"
                className="neo-btn neo-btn--sm"
                onClick={() => navigate('campus')}
              >
                Retour au campus
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="mission-center">
        <div className="neo-panel" style={{ minHeight: 0 }}>
          <div className="neo-panel__head">
            <div className="tabs" role="tablist" aria-label="Outils techniques">
              <button
                type="button"
                role="tab"
                aria-selected={centerTab === 'terminal'}
                onClick={() => setCenterTab('terminal')}
              >
                Terminal
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={centerTab === 'console'}
                onClick={() => setCenterTab('console')}
              >
                Console equipement
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={centerTab === 'materiel'}
                onClick={() => setCenterTab('materiel')}
              >
                Materiel
              </button>
            </div>
            {centerTab === 'materiel' ? null : centerTab === 'terminal' ? (
              <select
                className="neo-select"
                style={{ width: 'auto' }}
                value={machineId}
                onChange={(event) => setMachineChoice(event.target.value)}
                aria-label="Machine cible du terminal"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.hostname} ({machine.os})
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="neo-select"
                style={{ width: 'auto' }}
                value={switchId}
                onChange={(event) => setSwitchChoice(event.target.value)}
                aria-label="Equipement cible de la console"
              >
                {switches.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.hostname}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="neo-panel__body neo-panel__body--flush" style={{ minHeight: 0 }}>
            {centerTab === 'materiel' ? (
              <Suspense
                fallback={<div style={{ padding: 16 }}>Chargement de la vue materielle...</div>}
              >
                <Hardware3D
                  world={world}
                  profile={session.profile}
                  version={version}
                  onChange={refresh}
                />
              </Suspense>
            ) : null}
            {centerTab === 'terminal' && terminal ? (
              <TerminalPanel
                key={machineId}
                console={terminal}
                title={machines.find((m) => m.id === machineId)?.hostname ?? 'terminal'}
                intro={
                  'Terminal simule. Tapez "aide" pour la liste exacte des commandes implementees.'
                }
                onCommand={refresh}
              />
            ) : null}
            {centerTab === 'console' && switchConsole ? (
              <TerminalPanel
                key={switchId}
                console={switchConsole}
                title={switches.find((n) => n.id === switchId)?.hostname ?? 'console'}
                intro={'Console equipement. Tapez "?" pour la liste des commandes.'}
                onCommand={refresh}
              />
            ) : null}
          </div>
        </div>

        <NetworkXray world={world} profile={session.profile} version={version} />
      </div>

      <aside style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          className="tabs"
          role="tablist"
          aria-label="Panneaux lateraux"
          style={{ marginBottom: 8 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={sideTab === 'nova'}
            onClick={() => setSideTab('nova')}
          >
            NOVA
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sideTab === 'tickets'}
            onClick={() => setSideTab('tickets')}
          >
            Tickets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sideTab === 'supervision'}
            onClick={() => setSideTab('supervision')}
          >
            Supervision
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {sideTab === 'nova' && session.nova ? (
            <NovaPanel nova={session.nova} version={version} onAction={refresh} />
          ) : null}
          {sideTab === 'tickets' ? (
            <TicketsPanel world={world} version={version} onChange={refresh} />
          ) : null}
          {sideTab === 'supervision' ? (
            <MonitoringPanel world={world} version={version} onChange={refresh} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
