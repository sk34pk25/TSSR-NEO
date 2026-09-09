import { useMemo, useState } from 'react';
import { Rng } from '@tssr/events';
import { buildReviewSession, checkAnswer, type ReviewChallenge } from '@tssr/knowledge';
import { planReviewSession } from '@tssr/progression';
import { useSession } from '../state/hooks.ts';

/** NEO Review : sessions courtes guidees par la repetition espacee. */
export function ReviewView(): JSX.Element {
  const session = useSession();
  const [minutes, setMinutes] = useState(10);
  const [challenges, setChallenges] = useState<ReviewChallenge[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'none' | 'correct' | 'incorrect'>('none');
  const [correct, setCorrect] = useState(0);

  const plan = useMemo(
    () => planReviewSession(session.progress, minutes),
    [session.progress, minutes],
  );

  function start(): void {
    const built = buildReviewSession(session.library, session.progress.competencies, {
      minutes,
      rng: new Rng(Date.now() % 100000),
    });
    setChallenges(built);
    setIndex(0);
    setAnswer('');
    setResult('none');
    setCorrect(0);
  }

  const current = challenges[index];

  return (
    <div>
      <h1>NEO Review</h1>
      <p className="neo-muted" style={{ maxWidth: '70ch' }}>
        Une session courte pour ancrer ce qui a ete travaille. Les questions sont derivees des fiches
        reelles des modules charges, jamais generees au hasard.
      </p>

      {challenges.length === 0 ? (
        <div className="neo-card">
          <div className="neo-row">
            <label htmlFor="review-minutes" className="neo-muted">
              Duree
            </label>
            <select
              id="review-minutes"
              className="neo-select"
              style={{ width: 'auto' }}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
            </select>
            <button type="button" className="neo-btn neo-btn--primary" onClick={start}>
              Demarrer la session
            </button>
          </div>

          {plan.length > 0 ? (
            <div style={{ marginTop: 'var(--neo-space-4)' }}>
              <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Ce qui sera revise</h3>
              <table className="neo-table">
                <thead>
                  <tr>
                    <th>Competence</th>
                    <th>Maitrise</th>
                    <th>Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((item) => (
                    <tr key={item.competencyId}>
                      <td>{item.competencyId}</td>
                      <td>{Math.round(item.mastery * 100)} %</td>
                      <td className="neo-muted">{item.reason === 'due' ? 'echeance atteinte' : 'maitrise fragile'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="neo-muted" style={{ marginTop: 'var(--neo-space-3)' }}>
              Aucune competence suivie pour l instant : terminez une mission pour alimenter les revisions.
            </p>
          )}
        </div>
      ) : current ? (
        <div className="neo-card">
          <div className="neo-row" style={{ justifyContent: 'space-between' }}>
            <span className="neo-tag neo-tag--accent">
              {index + 1} / {challenges.length}
            </span>
            <span className="neo-tag">{current.competencyId}</span>
          </div>
          <h2 style={{ marginTop: 'var(--neo-space-3)' }}>{current.question}</h2>
          <form
            className="neo-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (result !== 'none') return;
              const ok = checkAnswer(current, answer);
              setResult(ok ? 'correct' : 'incorrect');
              if (ok) setCorrect((value) => value + 1);
            }}
          >
            <input
              className="neo-input neo-grow"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Votre reponse"
              aria-label="Votre reponse"
              disabled={result !== 'none'}
            />
            <button type="submit" className="neo-btn" disabled={result !== 'none' || answer.trim() === ''}>
              Valider
            </button>
          </form>

          {result !== 'none' ? (
            <div className={`nova-message ${result === 'correct' ? 'nova-message--encouraging' : 'nova-message--warning'}`} style={{ marginTop: 'var(--neo-space-3)' }}>
              <strong>{result === 'correct' ? 'Correct' : 'A revoir'}</strong>
              <div>{current.explanation}</div>
              <a className="neo-tag neo-tag--accent" href={`#/connaissances/${current.entryId}`} style={{ marginTop: 8 }}>
                Ouvrir la fiche
              </a>
            </div>
          ) : null}

          {result !== 'none' ? (
            <button
              type="button"
              className="neo-btn neo-btn--primary"
              style={{ marginTop: 'var(--neo-space-3)' }}
              onClick={() => {
                if (index + 1 >= challenges.length) {
                  setChallenges([]);
                  return;
                }
                setIndex(index + 1);
                setAnswer('');
                setResult('none');
              }}
            >
              {index + 1 >= challenges.length ? `Terminer (${correct}/${challenges.length})` : 'Question suivante'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
