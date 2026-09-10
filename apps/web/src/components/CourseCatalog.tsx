import { checkPrerequisites } from '@tssr/progression';
import { navigate, useSession } from '../state/hooks.ts';

/**
 * Catalogue des cours.
 *
 * Il repond a « qu est-ce que j apprends ? ». Cette question n a rien a voir
 * avec « ou suis-je ? » : le catalogue ne vit donc plus dans le campus, qui est
 * un lieu, mais dans l espace d apprentissage.
 */
export function CourseCatalog(): JSX.Element {
  const session = useSession();

  if (session.courses.length === 0) {
    return (
      <div className="neo-card">
        <h3>Aucun cours charge</h3>
        <p className="neo-muted">
          Aucun module pedagogique n est installe dans cette version. Le laboratoire libre reste
          accessible pour manipuler l infrastructure sans objectif impose.
        </p>
      </div>
    );
  }

  return (
    <div className="card-grid">
      {session.courses.map((course) => {
        const step = course.path.find((entry) => entry.kind === 'mission');
        const mission = step?.kind === 'mission' ? session.mission(step.missionId) : undefined;
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
                deja termine, meilleur bilan {Math.round((record.bestScore?.overall ?? 0) * 100)} %
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
                onClick={() => navigate('parcours')}
              >
                Preparer
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
