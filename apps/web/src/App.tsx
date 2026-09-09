import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { AppShell } from './components/Shell.tsx';
import { CampusView } from './views/CampusView.tsx';
import { DiagnosticsView } from './views/DiagnosticsView.tsx';
import { HomeView } from './views/HomeView.tsx';
import { KnowledgeView } from './views/KnowledgeView.tsx';
import { LabView } from './views/LabView.tsx';
import { LearnView } from './views/LearnView.tsx';
import { MissionView } from './views/MissionView.tsx';
import { ProgressionView } from './views/ProgressionView.tsx';
import { ReviewView } from './views/ReviewView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { SupervisionView, TicketsView } from './views/SimpleViews.tsx';
import { TrainerView } from './views/TrainerView.tsx';
import { useRoute, useSession } from './state/hooks.ts';

/** Aucun ecran blanc : une erreur de rendu reste rattrapable par l utilisateur. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | undefined }> {
  override state: { error: Error | undefined } = { error: undefined };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur de rendu TSSR NEO', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div className="shell__content">
        <div className="neo-card">
          <h1>Une erreur est survenue dans cet ecran</h1>
          <p className="neo-muted">
            Votre progression est conservee. Vous pouvez revenir a l accueil ou consulter les
            diagnostics.
          </p>
          <pre className="neo-mono" style={{ overflowX: 'auto', color: 'var(--neo-danger)' }}>
            {this.state.error.message}
          </pre>
          <div className="neo-row">
            <button
              type="button"
              className="neo-btn neo-btn--primary"
              onClick={() => {
                this.setState({ error: undefined });
                window.location.hash = '#/accueil';
              }}
            >
              Revenir a l accueil
            </button>
            <a className="neo-btn" href="#/diagnostics">
              Ouvrir les diagnostics
            </a>
          </div>
        </div>
      </div>
    );
  }
}

function CurrentView(): JSX.Element {
  const route = useRoute();
  switch (route.name) {
    case 'apprendre':
      return <LearnView />;
    case 'campus':
      return <CampusView />;
    case 'mission':
      return <MissionView />;
    case 'laboratoire':
      return <LabView />;
    case 'connaissances':
      return <KnowledgeView />;
    case 'revision':
      return <ReviewView />;
    case 'progression':
      return <ProgressionView />;
    case 'supervision':
      return <SupervisionView />;
    case 'tickets':
      return <TicketsView />;
    case 'formateur':
      return <TrainerView />;
    case 'reglages':
      return <SettingsView />;
    case 'diagnostics':
      return <DiagnosticsView />;
    default:
      return <HomeView />;
  }
}

export function App(): JSX.Element {
  const session = useSession();
  const route = useRoute();
  // Le campus est un lieu ; la mission et le laboratoire sont des plans de travail.
  const variant =
    route.name === 'campus'
      ? 'lieu'
      : route.name === 'mission' || route.name === 'laboratoire'
        ? 'large'
        : 'page';

  useEffect(() => {
    void session.boot();
    const onLeave = (): void => {
      void session.shutdown();
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [session]);

  if (!session.booted) {
    return (
      <div className="boot-screen" role="status">
        <p>Initialisation de TSSR NEO...</p>
      </div>
    );
  }

  return (
    <AppShell variant={variant}>
      <ErrorBoundary>
        <CurrentView />
      </ErrorBoundary>
    </AppShell>
  );
}
