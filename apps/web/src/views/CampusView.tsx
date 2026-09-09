import { lazy, Suspense } from 'react';
import { checkPrerequisites } from '@tssr/progression';
import { zoneById } from '@tssr/rendering';
import { navigate, useSession } from '../state/hooks.ts';

// Le campus tridimensionnel embarque le moteur graphique : il est charge a la demande.
const Campus3D = lazy(() =>
  import('../components/Campus3D.tsx').then((module) => ({ default: module.Campus3D })),
);

/**
 * Campus NEO Systems.
 * Il sert de plan mental du site : chaque zone mene directement a une activite,
 * sans traversee inutile.
 */
export function CampusView(): JSX.Element {
  const session = useSession();

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
        <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
          Chaque zone visible mene a une fonction reelle de la plateforme. La liste sous la vue
          donne exactement les memes acces au clavier.
        </p>
        <Suspense
          fallback={
            <div className="neo-card" role="status">
              Preparation du campus...
            </div>
          }
        >
          <Campus3D
            profile={session.profile}
            reduceMotion={session.progress.preferences.accessibility.reduceMotion}
            highlightZoneIds={session.runner === undefined ? [] : ['training-lab']}
            onEnterZone={(zoneId) => {
              const zone = zoneById(zoneId);
              if (!zone) return;
              // Une zone qui exige une infrastructure la prepare avant d ouvrir l ecran.
              const needsWorld =
                zone.route === 'laboratoire' ||
                zone.route === 'supervision' ||
                zone.route === 'tickets';
              if (needsWorld && session.world === undefined) session.startFreeLab();
              navigate(zone.route);
            }}
          />
        </Suspense>
      </section>
    </div>
  );
}
