import { useEffect, useState } from 'react';
import { ClassroomStore, analyseCohort, type Cohort, type CohortReport } from '@tssr/classroom';
import { createProfile } from '@tssr/progression';
import { Meter } from '../components/Meter.tsx';
import { navigate, useSession } from '../state/hooks.ts';

/**
 * NEO Studio, cockpit formateur.
 *
 * Entierement local : la cohorte vit dans le stockage de l appareil. Chaque
 * apprenant porte son origine, de sorte qu un profil de demonstration ne puisse
 * jamais passer pour un apprenant reel. Aucune synchronisation distante n est
 * simulee : l etat reel du service est affiche tel quel.
 */
export function TrainerView(): JSX.Element {
  const session = useSession();
  const [store] = useState(() => new ClassroomStore());
  const [cohort, setCohort] = useState<Cohort | undefined>(undefined);
  const [report, setReport] = useState<CohortReport | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const competencies = session.modules.flatMap((module) => module.competencies);

  useEffect(() => {
    void (async () => {
      await store.load();
      await store.upsertLocalLearner(session.progress);
      const current = store.get();
      setCohort({ ...current });
      setReport(analyseCohort(current, competencies, session.missions));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.progress, store]);

  function refresh(): void {
    const current = store.get();
    setCohort({ ...current });
    setReport(analyseCohort(current, competencies, session.missions));
  }

  const allowed = session.can('class:read');

  if (!allowed) {
    return (
      <div className="neo-card">
        <h1>NEO Studio</h1>
        <p className="neo-muted">{session.whyNot('class:read')}</p>
        <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
          Vous pouvez changer de role depuis NEO Diagnostics pour explorer ce cockpit.
        </p>
        <button type="button" className="neo-btn" onClick={() => navigate('diagnostics')}>
          Ouvrir les diagnostics
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>NEO Studio</h1>
      <p className="neo-muted" style={{ maxWidth: '74ch' }}>
        Cockpit formateur, alimente par les donnees reellement presentes sur cet appareil. Les
        profils de demonstration servent a eprouver les analyses ; ils sont signales comme tels et
        ne sont jamais melanges aux apprenants reels dans la lecture.
      </p>

      <div className="banner banner--warning">
        <div>
          <strong>Portee de ce cockpit</strong>
          <p className="neo-muted" style={{ margin: '4px 0 0', fontSize: 'var(--neo-fs-sm)' }}>
            Etat de la synchronisation : <strong>{session.syncState.status}</strong>,{' '}
            {session.syncState.pending} operation(s) en file. Aucun service distant n est configure,
            donc aucun suivi multi-appareils n est actif. Les operations attendent en local sans
            perte, et repartiront des qu un service sera branche.
          </p>
        </div>
      </div>

      {message !== undefined ? (
        <p className="neo-tag neo-tag--accent" style={{ marginBottom: 'var(--neo-space-3)' }}>
          {message}
        </p>
      ) : null}

      <section className="neo-card">
        <div className="neo-row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--neo-fs-lg)', margin: 0 }}>
            {cohort?.name} — {report?.learners ?? 0} apprenant(s)
          </h2>
          <button
            type="button"
            className="neo-btn neo-btn--sm"
            onClick={() => {
              // Profils de demonstration : varies, pour eprouver reellement les analyses.
              const seeds = [
                {
                  name: 'Profil demo — debutant',
                  mastery: 0.25,
                  completed: false,
                  attempts: 3,
                  hints: 4,
                },
                {
                  name: 'Profil demo — intermediaire',
                  mastery: 0.55,
                  completed: true,
                  attempts: 2,
                  hints: 1,
                },
                {
                  name: 'Profil demo — autonome',
                  mastery: 0.88,
                  completed: true,
                  attempts: 1,
                  hints: 0,
                },
              ];
              const mission = session.missions[0];
              for (const [index, seed] of seeds.entries()) {
                const base = createProfile(`demo-${Date.now()}-${index}`, seed.name);
                base.competencies = competencies.map((competency) => ({
                  competencyId: competency.id,
                  mastery: Math.max(
                    0,
                    Math.min(1, seed.mastery + (index % 2 === 0 ? -0.08 : 0.06)),
                  ),
                  confidence: 0.7,
                  observations: 4,
                }));
                if (mission) {
                  base.missions = [
                    {
                      missionId: mission.id,
                      attempts: seed.attempts,
                      completed: seed.completed,
                      lastPlayedAt: Date.now(),
                      bestScore: {
                        missionId: mission.id,
                        dimensions: {
                          technicalAccuracy: seed.mastery,
                          diagnosis: seed.mastery,
                          autonomy: 1 - seed.hints * 0.15,
                          efficiency: 0.8,
                          impact: 1,
                          safety: 1,
                          verification: seed.mastery,
                          documentation: seed.mastery,
                        },
                        overall: seed.mastery,
                        objectivesCompleted: seed.completed ? 6 : 3,
                        objectivesTotal: 6,
                        hintsUsed: seed.hints,
                        durationMs: 900000,
                        competencyDeltas: [],
                      },
                      lastScore: {
                        missionId: mission.id,
                        dimensions: {},
                        overall: seed.mastery,
                        objectivesCompleted: seed.completed ? 6 : 3,
                        objectivesTotal: 6,
                        hintsUsed: seed.hints,
                        durationMs: 900000,
                        competencyDeltas: [],
                      },
                    },
                  ];
                }
                void store.addDemonstrationLearner({
                  id: base.profileId,
                  displayName: seed.name,
                  progress: base,
                });
              }
              setMessage(
                'Trois profils de demonstration ajoutes, explicitement signales comme tels.',
              );
              window.setTimeout(refresh, 30);
            }}
          >
            Ajouter des profils de demonstration
          </button>
        </div>

        <table className="neo-table" style={{ marginTop: 'var(--neo-space-3)' }}>
          <thead>
            <tr>
              <th>Apprenant</th>
              <th>Origine</th>
              <th>Niveau</th>
              <th>Missions terminees</th>
              <th>Tentatives</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(cohort?.learners ?? []).map((learner) => (
              <tr key={learner.id}>
                <td>{learner.displayName}</td>
                <td>
                  <span
                    className={`neo-tag ${learner.origin === 'local' ? 'neo-tag--ok' : 'neo-tag--warn'}`}
                  >
                    {learner.origin === 'local' ? 'apprenant reel' : 'demonstration'}
                  </span>
                </td>
                <td className="neo-muted">{learner.progress.level}</td>
                <td className="neo-muted">
                  {learner.progress.missions.filter((m) => m.completed).length}
                </td>
                <td className="neo-muted">
                  {learner.progress.missions.reduce((sum, m) => sum + m.attempts, 0)}
                </td>
                <td>
                  {learner.origin === 'demonstration' ? (
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--ghost"
                      onClick={() => {
                        void store.removeLearner(learner.id).then(refresh);
                      }}
                    >
                      Retirer
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-4)' }}>
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Points faibles du groupe</h2>
        {report && report.weakPoints.length > 0 ? (
          <table className="neo-table">
            <thead>
              <tr>
                <th>Competence</th>
                <th>Constat</th>
                <th>Severite</th>
              </tr>
            </thead>
            <tbody>
              {report.weakPoints.map((point) => (
                <tr key={point.competencyId}>
                  <td>{point.label}</td>
                  <td className="neo-muted">{point.reason}</td>
                  <td>
                    <Meter
                      value={Math.min(1, point.severity * 2)}
                      label={`Severite du point faible ${point.label}`}
                      width={110}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="neo-muted">
            Aucun point faible mesurable : le groupe n a pas encore assez pratique pour conclure.
          </p>
        )}
      </section>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-4)' }}>
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Competences</h2>
        <table className="neo-table">
          <thead>
            <tr>
              <th>Competence</th>
              <th>Maitrise moyenne</th>
              <th>Mesures</th>
              <th>Sous le seuil</th>
            </tr>
          </thead>
          <tbody>
            {(report?.competencies ?? []).map((entry) => (
              <tr key={entry.competencyId}>
                <td>{entry.label}</td>
                <td>
                  {entry.learnersMeasured === 0 ? (
                    <span className="neo-dim">non pratiquee</span>
                  ) : (
                    `${Math.round(entry.averageMastery * 100)} %`
                  )}
                </td>
                <td className="neo-muted">{entry.learnersMeasured}</td>
                <td className="neo-muted">{entry.learnersBelowThreshold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-4)' }}>
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Missions</h2>
        <table className="neo-table">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Tentee par</th>
              <th>Terminee par</th>
              <th>Tentatives moyennes</th>
              <th>Bilan moyen</th>
              <th>Indices moyens</th>
            </tr>
          </thead>
          <tbody>
            {(report?.missions ?? []).map((entry) => (
              <tr key={entry.missionId}>
                <td>{entry.title}</td>
                <td className="neo-muted">{entry.attempted}</td>
                <td className="neo-muted">{entry.completed}</td>
                <td className="neo-muted">{entry.averageAttempts}</td>
                <td className="neo-muted">{Math.round(entry.averageScore * 100)} %</td>
                <td className="neo-muted">{entry.averageHints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-4)' }}>
        <div className="neo-row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--neo-fs-lg)', margin: 0 }}>Affectations</h2>
          <button
            type="button"
            className="neo-btn neo-btn--sm"
            disabled={!session.can('assignment:create') || session.missions.length === 0}
            title={session.can('assignment:create') ? '' : session.whyNot('assignment:create')}
            onClick={() => {
              const mission = session.missions[0];
              if (!mission || !cohort) return;
              void store
                .createAssignment(
                  {
                    missionId: mission.id,
                    title: typeof mission.title === 'string' ? mission.title : mission.id,
                    learnerIds: cohort.learners.map((learner) => learner.id),
                  },
                  Date.now(),
                )
                .then(() => {
                  setMessage('Affectation creee pour l ensemble du groupe.');
                  refresh();
                });
            }}
          >
            Affecter la mission a tout le groupe
          </button>
        </div>
        {(cohort?.assignments ?? []).length === 0 ? (
          <p className="neo-muted" style={{ marginTop: 'var(--neo-space-3)' }}>
            Aucune affectation. L avancement affiche sera calcule sur la progression reelle.
          </p>
        ) : (
          <table className="neo-table" style={{ marginTop: 'var(--neo-space-3)' }}>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Avancement</th>
                <th>Creee le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(cohort?.assignments ?? []).map((assignment) => {
                const progress = store.assignmentProgress(assignment);
                return (
                  <tr key={assignment.id}>
                    <td>{assignment.title}</td>
                    <td className="neo-muted">
                      {progress.done} / {progress.total}
                    </td>
                    <td className="neo-muted">
                      {new Date(assignment.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--ghost"
                        onClick={() => {
                          void store.removeAssignment(assignment.id).then(refresh);
                        }}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
