import { xpForLevel } from '@tssr/progression';
import { Meter } from '../components/Meter.tsx';
import { navigate, useSession } from '../state/hooks.ts';

/** Progression du joueur : competences, missions et badges pedagogiques. */
export function ProgressionView(): JSX.Element {
  const session = useSession();
  const progress = session.progress;
  const currentFloor = xpForLevel(progress.level);
  const nextFloor = xpForLevel(progress.level + 1);
  const ratio = Math.min(1, (progress.xp - currentFloor) / Math.max(1, nextFloor - currentFloor));

  return (
    <div>
      <h1>Progression</h1>
      <div className="neo-card">
        <div className="neo-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{progress.displayName}</h2>
            <span className="neo-muted">
              Rang {progress.careerRank}, niveau {progress.level}
            </span>
          </div>
          <span className="neo-tag neo-tag--accent">{progress.xp} XP</span>
        </div>
        <Meter
          value={ratio}
          label="Progression vers le niveau suivant"
          valueText={`niveau ${progress.level}, ${nextFloor - progress.xp} experience avant le niveau suivant`}
        />
        <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)', marginTop: 6 }}>
          {nextFloor - progress.xp} XP avant le niveau {progress.level + 1}. Les niveaux et badges
          sont pedagogiques : TSSR NEO ne delivre aucune certification.
        </p>
      </div>

      <section style={{ marginTop: 'var(--neo-space-5)' }}>
        <h2>Competences</h2>
        {progress.competencies.length === 0 ? (
          <p className="neo-muted">
            Aucune competence mesuree pour l instant. Terminez une mission pour alimenter le suivi.
          </p>
        ) : (
          <table className="neo-table">
            <thead>
              <tr>
                <th>Competence</th>
                <th>Maitrise</th>
                <th>Fiabilite</th>
                <th>Observations</th>
                <th>Prochaine revision</th>
              </tr>
            </thead>
            <tbody>
              {progress.competencies.map((competency) => (
                <tr key={competency.competencyId}>
                  <td>{competency.competencyId}</td>
                  <td>
                    <Meter
                      value={competency.mastery}
                      label={`Maitrise de ${competency.competencyId}`}
                      width={120}
                    />
                    <span className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)' }}>
                      {Math.round(competency.mastery * 100)} %
                    </span>
                  </td>
                  <td className="neo-muted">{Math.round(competency.confidence * 100)} %</td>
                  <td className="neo-muted">{competency.observations}</td>
                  <td className="neo-muted">
                    {competency.dueAt === undefined
                      ? 'a definir'
                      : new Date(competency.dueAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: 'var(--neo-space-5)' }}>
        <h2>Missions</h2>
        {progress.missions.length === 0 ? (
          <div className="neo-row">
            <p className="neo-muted" style={{ margin: 0 }}>
              Aucune mission jouee.
            </p>
            <button
              type="button"
              className="neo-btn neo-btn--sm"
              onClick={() => navigate('campus')}
            >
              Choisir un cours
            </button>
          </div>
        ) : (
          <table className="neo-table">
            <thead>
              <tr>
                <th>Mission</th>
                <th>Tentatives</th>
                <th>Meilleur bilan</th>
                <th>Etat</th>
              </tr>
            </thead>
            <tbody>
              {progress.missions.map((record) => (
                <tr key={record.missionId}>
                  <td>{session.mission(record.missionId)?.id ?? record.missionId}</td>
                  <td className="neo-muted">{record.attempts}</td>
                  <td className="neo-muted">
                    {Math.round((record.bestScore?.overall ?? 0) * 100)} %
                  </td>
                  <td>
                    <span
                      className={`neo-tag ${record.completed ? 'neo-tag--ok' : 'neo-tag--warn'}`}
                    >
                      {record.completed ? 'terminee' : 'en cours'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
