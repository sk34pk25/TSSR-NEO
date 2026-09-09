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
