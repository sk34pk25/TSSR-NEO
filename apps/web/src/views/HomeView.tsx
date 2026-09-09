import { Logo } from '../components/Logo.tsx';
import { navigate, useSession } from '../state/hooks.ts';

/** Accueil : entrer vite, comprendre tout de suite ou l on est et ce qu on peut faire. */
export function HomeView(): JSX.Element {
  const session = useSession();
  const hasSession = session.world !== undefined;
  const completed = session.progress.missions.filter((m) => m.completed).length;

  return (
    <div>
      {session.recovery !== undefined ? (
        <div className="banner banner--warning" role="alert">
          <div className="neo-grow">
            <strong>Session precedente interrompue</strong>
            <p className="neo-muted" style={{ margin: '4px 0 0', fontSize: 'var(--neo-fs-sm)' }}>
              Un etat coherent a ete retrouve
              {session.recovery.source === 'checkpoint' ? ' (dernier point de controle sain)' : ' (sauvegarde automatique)'}.
              Vous pouvez reprendre exactement ou vous en etiez.
            </p>
          </div>
          <div className="neo-row">
            <button
              type="button"
              className="neo-btn neo-btn--primary neo-btn--sm"
              onClick={() => {
                if (session.recovery) {
                  session.restore(session.recovery.save);
                  navigate('mission');
                }
              }}
            >
              Reprendre
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--sm"
              onClick={() => void session.dismissRecovery()}
            >
              Ignorer
            </button>
          </div>
        </div>
      ) : null}

      <section className="hero">
        <div>
          <Logo size={54} withWordmark={false} />
          <h1 className="hero__title">Apprendre le metier, pas seulement les commandes</h1>
          <p className="hero__lede">
            TSSR NEO simule une infrastructure complete dans votre navigateur : reseau, systemes, tickets,
            supervision et materiel. Chaque commande que vous tapez modifie reellement cette infrastructure,
            et chaque objectif est verifie sur son etat, jamais sur un clic.
          </p>
          <div className="neo-row" style={{ marginTop: 'var(--neo-space-4)' }}>
            <button
              type="button"
              className="neo-btn neo-btn--primary"
              onClick={() => {
                if (!hasSession) session.startMission(session.missions[0]?.id ?? '');
                navigate(hasSession ? 'mission' : 'mission');
              }}
            >
              {hasSession ? 'Reprendre la session' : 'Entrer dans NEO Systems'}
            </button>
            <button type="button" className="neo-btn" onClick={() => navigate('campus')}>
              Parcourir les cours
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--ghost"
              onClick={() => {
                session.startFreeLab();
                navigate('laboratoire');
              }}
            >
              Laboratoire libre
            </button>
          </div>
          <p className="neo-dim" style={{ marginTop: 'var(--neo-space-3)', fontSize: 'var(--neo-fs-sm)' }}>
            Aucun compte requis. Votre progression reste sur cet appareil tant que vous ne demandez pas
            explicitement de synchronisation.
          </p>
        </div>

        <div className="neo-card">
          <h3>Ou vous en etes</h3>
          <dl className="kv">
            <dt>Rang</dt>
            <dd>{session.progress.careerRank}</dd>
            <dt>Niveau</dt>
            <dd>{session.progress.level}</dd>
            <dt>Experience</dt>
            <dd>{session.progress.xp}</dd>
            <dt>Missions terminees</dt>
            <dd>
              {completed} / {session.missions.length}
            </dd>
            <dt>Competences suivies</dt>
            <dd>{session.progress.competencies.length}</dd>
            <dt>Stockage</dt>
            <dd>{session.storageMode === 'indexeddb' ? 'local persistant' : 'memoire (non persistant)'}</dd>
          </dl>
          {session.progress.badges.length > 0 ? (
            <div className="neo-row" style={{ marginTop: 'var(--neo-space-3)' }}>
              {session.progress.badges.map((badge) => (
                <span key={badge.id} className="neo-tag neo-tag--accent">
                  {badge.id.replace('badge-', '').replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          ) : (
            <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-sm)', marginBottom: 0 }}>
              Les badges sont purement pedagogiques. TSSR NEO ne delivre aucune certification ni attestation.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>Ce que la plateforme fait reellement</h2>
        <div className="card-grid">
          <article className="course-card">
            <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Un reseau qui se comporte comme un reseau</h3>
            <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
              Commutation VLAN, ARP, routage au plus long prefixe, pare-feu, NAT, DNS et DHCP sont simules.
              Un port dans le mauvais VLAN casse vraiment la connectivite, et le diagnostic explique pourquoi.
            </p>
          </article>
          <article className="course-card">
            <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Un terminal reellement interprete</h3>
            <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
              Les commandes agissent sur l etat simule. Une commande non implementee est refusee explicitement,
              jamais remplacee par une reponse fabriquee.
            </p>
          </article>
          <article className="course-card">
            <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Une evaluation sur les faits</h3>
            <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
              Les objectifs sont verifies sur l etat final, la methode, la securite et la documentation.
              Plusieurs solutions valides sont acceptees, et le debrief les compare.
            </p>
          </article>
          <article className="course-card">
            <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Hors ligne et sans traqueur</h3>
            <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
              Tout fonctionne localement. Aucune publicite, aucun suivi marketing, aucune donnee envoyee
              sans votre accord explicite.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
