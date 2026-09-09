import { useState } from 'react';
import { MonitoringPanel, TicketsPanel } from '../components/MissionPanels.tsx';
import { navigate, useSession } from '../state/hooks.ts';

function NoWorld({ what }: { what: string }): JSX.Element {
  const session = useSession();
  return (
    <div className="neo-card">
      <h2>{what} indisponible</h2>
      <p className="neo-muted">
        Cette vue s appuie sur une infrastructure chargee. Demarrez une mission ou ouvrez le
        laboratoire libre.
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

export function SupervisionView(): JSX.Element {
  const session = useSession();
  const [version, setVersion] = useState(0);
  if (!session.world) return <NoWorld what="Supervision" />;
  return (
    <div style={{ height: 'calc(100vh - 140px)' }}>
      <h1>NEO Monitoring</h1>
      <div style={{ height: 'calc(100% - 60px)' }}>
        <MonitoringPanel
          world={session.world}
          version={version}
          onChange={() => setVersion((v) => v + 1)}
        />
      </div>
    </div>
  );
}

export function TicketsView(): JSX.Element {
  const session = useSession();
  const [version, setVersion] = useState(0);
  if (!session.world) return <NoWorld what="File de tickets" />;
  return (
    <div style={{ height: 'calc(100vh - 140px)' }}>
      <h1>Gestion des services</h1>
      <div style={{ height: 'calc(100% - 60px)' }}>
        <TicketsPanel
          world={session.world}
          version={version}
          onChange={() => {
            session.tick();
            setVersion((v) => v + 1);
          }}
        />
      </div>
    </div>
  );
}

/**
 * Cockpit formateur.
 * Sans compte ni service distant, seul l apprenant de cet appareil est visible :
 * le suivi de groupe demande une synchronisation qui n est pas encore active.
 */
export function TrainerView(): JSX.Element {
  const session = useSession();
  const progress = session.progress;
  const weakest = [...progress.competencies].sort((a, b) => a.mastery - b.mastery).slice(0, 5);

  return (
    <div>
      <h1>NEO Studio</h1>
      <div className="banner banner--warning">
        <div>
          <strong>Portee actuelle</strong>
          <p className="neo-muted" style={{ margin: '4px 0 0', fontSize: 'var(--neo-fs-sm)' }}>
            Le suivi de classe necessite un service de synchronisation, qui n est pas encore active
            sur cette installation. Seules les donnees locales de cet appareil sont affichees
            ci-dessous. Aucune donnee fictive n est presentee comme reelle.
          </p>
        </div>
      </div>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Apprenant local</h2>
        <dl className="kv">
          <dt>Profil</dt>
          <dd>{progress.displayName}</dd>
          <dt>Niveau</dt>
          <dd>{progress.level}</dd>
          <dt>Missions terminees</dt>
          <dd>{progress.missions.filter((m) => m.completed).length}</dd>
          <dt>Tentatives cumulees</dt>
          <dd>{progress.missions.reduce((sum, m) => sum + m.attempts, 0)}</dd>
          <dt>Indices consommes (derniere mission)</dt>
          <dd>{progress.missions[progress.missions.length - 1]?.lastScore?.hintsUsed ?? 0}</dd>
        </dl>
      </section>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-4)' }}>
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Points a consolider</h2>
        {weakest.length === 0 ? (
          <p className="neo-muted">Aucune competence mesuree pour l instant.</p>
        ) : (
          <table className="neo-table">
            <thead>
              <tr>
                <th>Competence</th>
                <th>Maitrise</th>
                <th>Observations</th>
              </tr>
            </thead>
            <tbody>
              {weakest.map((competency) => (
                <tr key={competency.competencyId}>
                  <td>{competency.competencyId}</td>
                  <td>{Math.round(competency.mastery * 100)} %</td>
                  <td className="neo-muted">{competency.observations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
