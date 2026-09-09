import { checkPrerequisites } from '@tssr/progression';
import { navigate, useSession } from '../state/hooks.ts';

interface Area {
  id: string;
  name: string;
  purpose: string;
  action: { label: string; run: () => void };
}

/**
 * Campus NEO Systems.
 * Il sert de plan mental du site : chaque zone mene directement a une activite,
 * sans traversee inutile.
 */
export function CampusView(): JSX.Element {
  const session = useSession();

  const areas: Area[] = [
    {
      id: 'accueil',
      name: 'Accueil et support',
      purpose: 'File des demandes utilisateurs, qualification et priorisation.',
      action: { label: 'Ouvrir les tickets', run: () => navigate('tickets') },
    },
    {
      id: 'commandement',
      name: 'Centre de commandement',
      purpose: 'Supervision des equipements et des services, alertes en cours.',
      action: { label: 'Ouvrir la supervision', run: () => navigate('supervision') },
    },
    {
      id: 'salle-reseau',
      name: 'Salle reseau',
      purpose: 'Commutateurs, brassage, VLAN et plan d adressage.',
      action: {
        label: 'Ouvrir la vue reseau',
        run: () => {
          if (!session.world) session.startFreeLab();
          navigate('laboratoire');
        },
      },
    },
    {
      id: 'formation',
      name: 'Zone formation',
      purpose: 'Fiches de connaissances, revisions courtes et graphe de competences.',
      action: { label: 'Ouvrir les connaissances', run: () => navigate('connaissances') },
    },
    {
      id: 'espace-personnel',
      name: 'Espace personnel',
      purpose: 'Progression, competences suivies, badges et parametres.',
      action: { label: 'Voir la progression', run: () => navigate('progression') },
    },
    {
      id: 'studio',
      name: 'NEO Studio',
      purpose: 'Cockpit formateur : suivi de groupe et points faibles.',
      action: { label: 'Ouvrir le cockpit', run: () => navigate('formateur') },
    },
  ];

  return (
    <div>
      <h1>Campus NEO Systems</h1>
      <p className="neo-muted" style={{ maxWidth: '70ch' }}>
        Vous etes technicien systemes et reseaux chez NEO Systems. Le campus regroupe vos points d
        entree : chaque zone correspond a une activite reelle de la plateforme.
      </p>

      <section style={{ marginTop: 'var(--neo-space-5)' }}>
        <h2>Cours disponibles</h2>
        <div className="card-grid">
          {session.courses.map((course) => {
            const missionId = course.path.find((step) => step.kind === 'mission');
            const mission =
              missionId?.kind === 'mission' ? session.mission(missionId.missionId) : undefined;
            const record = mission
              ? session.progress.missions.find((m) => m.missionId === mission.id)
              : undefined;
            const prerequisites = mission
              ? checkPrerequisites(session.progress, mission.prerequisites)
              : { satisfied: true, blocking: [], advisory: [] };

            return (
              <article key={course.id} className="course-card">
                <div className="neo-row" style={{ justifyContent: 'space-between' }}>
                  <span className="neo-tag neo-tag--accent">{course.level}</span>
                  <span className="neo-tag">{course.estimatedHours} h</span>
                </div>
                <h3 style={{ fontSize: 'var(--neo-fs-md)', margin: 0 }}>
                  {typeof course.title === 'string' ? course.title : course.id}
                </h3>
                <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
                  {typeof course.summary === 'string' ? course.summary : ''}
                </p>
                {record?.completed === true ? (
                  <span className="neo-tag neo-tag--ok">
                    deja termine, meilleur bilan{' '}
                    {Math.round((record.bestScore?.overall ?? 0) * 100)} %
                  </span>
                ) : null}
                {prerequisites.advisory.length > 0 ? (
                  <span className="neo-tag neo-tag--warn">
                    conseil : consolider{' '}
                    {prerequisites.advisory.map((a) => a.competencyId).join(', ')}
                  </span>
                ) : null}
                <div className="neo-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--primary neo-btn--sm"
                    disabled={mission === undefined || !prerequisites.satisfied}
                    onClick={() => {
                      if (!mission) return;
                      session.startMission(mission.id);
                      navigate('mission');
                    }}
                  >
                    Demarrer
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--sm"
                    onClick={() => navigate('connaissances')}
                  >
                    Preparer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 'var(--neo-space-6)' }}>
        <h2>Zones du site</h2>
        <div className="card-grid">
          {areas.map((area) => (
            <article key={area.id} className="course-card">
              <h3 style={{ fontSize: 'var(--neo-fs-md)', margin: 0 }}>{area.name}</h3>
              <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
                {area.purpose}
              </p>
              <button type="button" className="neo-btn neo-btn--sm" onClick={area.action.run}>
                {area.action.label}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
