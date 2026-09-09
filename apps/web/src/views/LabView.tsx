import { useEffect, useState } from 'react';
import { MissionView } from './MissionView.tsx';
import { useSession } from '../state/hooks.ts';

/**
 * NEO Lab Builder.
 * Meme moteur que les missions, sans objectif impose : instantanes,
 * injection de panne controlee et remise a zero deterministe.
 */
export function LabView(): JSX.Element {
  const session = useSession();
  const [seed, setSeed] = useState(1);
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!session.world) session.startFreeLab(undefined, seed);
  }, [session, seed]);

  const world = session.world;

  return (
    <div className="neo-stack">
      <div className="neo-card">
        <div className="neo-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>Laboratoire libre</h1>
            <p className="neo-muted" style={{ margin: 0, fontSize: 'var(--neo-fs-sm)' }}>
              Manipulez sans contrainte. La meme graine reproduit toujours exactement le meme laboratoire.
            </p>
          </div>
          <div className="neo-row">
            <label className="neo-visually-hidden" htmlFor="lab-seed">
              Graine du laboratoire
            </label>
            <input
              id="lab-seed"
              className="neo-input"
              style={{ width: 110 }}
              type="number"
              min={0}
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
            />
            <button
              type="button"
              className="neo-btn neo-btn--sm"
              onClick={() => {
                session.startFreeLab(undefined, seed);
                setMessage(`Laboratoire regenere avec la graine ${seed}.`);
              }}
            >
              Regenerer
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--sm"
              onClick={() => void session.takeSnapshot(`Lab ${new Date().toLocaleTimeString('fr-FR')}`)}
            >
              Enregistrer un instantane
            </button>
          </div>
        </div>

        {world ? (
          <div className="neo-row" style={{ marginTop: 'var(--neo-space-3)' }}>
            <button
              type="button"
              className="neo-btn neo-btn--sm neo-btn--danger"
              onClick={() => {
                const link = world.state.network.links[0];
                if (!link) return;
                world.network.setLinkConnected(link.id, !link.connected);
                setMessage(
                  `Panne injectee : le lien ${link.id} est maintenant ${link.connected ? 'raccorde' : 'coupe'}.`,
                );
                session.tick();
              }}
            >
              Injecter une coupure de lien
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--sm neo-btn--danger"
              onClick={() => {
                const node = world.state.network.nodes.find((n) => n.services.length > 0);
                const service = node?.services[0];
                if (!node || !service) return;
                world.network.setServiceStatus(node.id, service.id, service.status === 'running' ? 'stopped' : 'running');
                setMessage(`Service ${service.name} de ${node.hostname} bascule.`);
                session.tick();
              }}
            >
              Basculer un service
            </button>
          </div>
        ) : null}

        {message !== undefined ? (
          <p className="neo-tag neo-tag--accent" style={{ marginTop: 'var(--neo-space-3)' }}>
            {message}
          </p>
        ) : null}
      </div>

      {session.snapshots.length > 0 ? (
        <div className="neo-card">
          <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Instantanes</h2>
          <table className="neo-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {session.snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{snapshot.name}</td>
                  <td className="neo-muted">{snapshot.kind}</td>
                  <td className="neo-muted">{new Date(snapshot.createdAt).toLocaleString('fr-FR')}</td>
                  <td>
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm"
                      onClick={() => {
                        void session.restoreSnapshot(snapshot.id).then((ok) => {
                          setMessage(ok ? `Etat restaure depuis "${snapshot.name}".` : 'Instantane illisible.');
                        });
                      }}
                    >
                      Restaurer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <MissionView />
    </div>
  );
}
