import type { CompetencyMastery, KnowledgeEntry } from '@tssr/contracts';
import type { Rng } from '@tssr/events';
import type { KnowledgeLibrary } from './library.ts';

export interface ReviewChallenge {
  id: string;
  competencyId: string;
  kind: 'command' | 'concept' | 'diagnostic';
  question: string;
  /** Reponses acceptees, comparees apres normalisation. */
  answers: string[];
  choices?: string[];
  explanation: string;
  entryId: string;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function checkAnswer(challenge: ReviewChallenge, given: string): boolean {
  const normalized = normalize(given);
  return challenge.answers.some((answer) => normalize(answer) === normalized);
}

/**
 * Sessions de revision courtes.
 * Les questions sont derivees des fiches reelles : aucun contenu invente a la volee.
 */
export function buildReviewSession(
  library: KnowledgeLibrary,
  masteries: readonly CompetencyMastery[],
  options: { minutes?: number; rng?: Rng; competencyIds?: string[]; now?: number } = {},
): ReviewChallenge[] {
  const minutes = options.minutes ?? 10;
  const capacity = Math.max(3, Math.floor(minutes / 1.5));
  const now = options.now ?? Date.now();
  const recommended = library.recommend(masteries, capacity * 2, now);
  const entries = recommended
    .map((r) => library.entry(r.entryId))
    .filter((e): e is KnowledgeEntry => e !== undefined)
    .filter(
      (e) =>
        options.competencyIds === undefined ||
        e.competencies.some((c) => options.competencyIds?.includes(c)),
    );

  const pool =
    entries.length > 0
      ? entries
      : library
          .all()
          .filter(
            (e) =>
              options.competencyIds === undefined ||
              e.competencies.some((c) => options.competencyIds?.includes(c)),
          );

  const challenges: ReviewChallenge[] = [];
  for (const entry of pool) {
    const competencyId = entry.competencies[0] ?? 'general';
    if (entry.command) {
      for (const example of entry.command.examples) {
        challenges.push({
          id: `rev-${entry.id}-${challenges.length}`,
          competencyId,
          kind: 'command',
          question: `Quelle commande permet de : ${typeof example.explanation === 'string' ? example.explanation : ''} ?`,
          answers: [example.cmd, example.cmd.split(' ')[0] ?? example.cmd],
          explanation: `${example.cmd} - ${typeof example.explanation === 'string' ? example.explanation : ''}`,
          entryId: entry.id,
        });
      }
    }
    if (entry.kind === 'pitfall' || entry.kind === 'concept') {
      const title = typeof entry.title === 'string' ? entry.title : '';
      const summary = typeof entry.summary === 'string' ? entry.summary : '';
      challenges.push({
        id: `rev-${entry.id}-${challenges.length}`,
        competencyId,
        kind: 'concept',
        question: `En une phrase : ${title} ?`,
        answers: [summary],
        explanation: summary,
        entryId: entry.id,
      });
    }
    if (challenges.length >= capacity * 2) break;
  }

  const ordered = options.rng ? options.rng.shuffle(challenges) : challenges;
  return ordered.slice(0, capacity);
}
