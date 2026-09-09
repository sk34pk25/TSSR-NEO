/** Recherche plein texte locale, sans dependance externe et tolerante aux fautes. */

export function normalizeText(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * Distance d edition bornee, variante de Damerau-Levenshtein (alignement optimal).
 * Elle compte l inversion de deux lettres adjacentes comme une seule erreur :
 * c est la faute de frappe la plus frequente.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let beforePrevious: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (beforePrevious[j - 2] as number) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] as number;
}

export interface IndexedDocument {
  id: string;
  /** Champs ponderes : un titre pese plus lourd qu un corps de texte. */
  fields: { text: string; weight: number }[];
  /** Priorite editoriale du document, appliquee au score final. */
  boost?: number;
}

export interface SearchHit {
  id: string;
  score: number;
  /** Termes reellement apparies, y compris apres correction orthographique. */
  matched: string[];
}

interface Posting {
  documentId: string;
  /** Nombre d occurrences du terme dans le document. */
  frequency: number;
  /** Poids du champ le plus important ou le terme apparait. */
  fieldWeight: number;
}

const K1 = 1.2;
const B = 0.6;

/**
 * Index inverse construit en memoire, adapte a une base de connaissances embarquee.
 * Le classement suit un modele BM25 : la repetition d un terme a un rendement
 * decroissant, et la longueur du document est prise en compte.
 */
export class SearchIndex {
  private readonly postings = new Map<string, Posting[]>();
  private readonly vocabulary: string[] = [];
  private readonly documentFrequency = new Map<string, number>();
  private readonly lengths = new Map<string, number>();
  private readonly boosts = new Map<string, number>();

  add(document: IndexedDocument): void {
    const counted = new Set<string>();
    let length = 0;
    for (const field of document.fields) {
      for (const token of tokenize(field.text)) {
        length += 1;
        const list = this.postings.get(token) ?? [];
        const existing = list.find((p) => p.documentId === document.id);
        if (existing) {
          existing.frequency += 1;
          existing.fieldWeight = Math.max(existing.fieldWeight, field.weight);
        } else {
          if (!this.postings.has(token)) this.vocabulary.push(token);
          list.push({ documentId: document.id, frequency: 1, fieldWeight: field.weight });
        }
        this.postings.set(token, list);
        counted.add(token);
      }
    }
    for (const token of counted) {
      this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    }
    this.lengths.set(document.id, length);
    this.boosts.set(document.id, document.boost ?? 1);
  }

  addAll(documents: readonly IndexedDocument[]): void {
    for (const document of documents) this.add(document);
  }

  size(): number {
    return this.vocabulary.length;
  }

  private averageLength(): number {
    if (this.lengths.size === 0) return 1;
    let total = 0;
    for (const value of this.lengths.values()) total += value;
    return total / this.lengths.size;
  }

  /** Resout un terme : correspondance exacte, puis prefixe, puis correction de faute. */
  private resolveTerm(term: string): { token: string; penalty: number }[] {
    if (this.postings.has(term)) return [{ token: term, penalty: 1 }];
    const prefixes = this.vocabulary.filter((v) => v.startsWith(term)).slice(0, 8);
    if (prefixes.length > 0) return prefixes.map((token) => ({ token, penalty: 0.8 }));
    const maxDistance = term.length <= 4 ? 2 : 2;
    const corrections: { token: string; distance: number }[] = [];
    for (const candidate of this.vocabulary) {
      const distance = boundedEditDistance(term, candidate, maxDistance);
      if (distance <= maxDistance) corrections.push({ token: candidate, distance });
    }
    return corrections
      .sort((a, b) => a.distance - b.distance || a.token.localeCompare(b.token))
      .slice(0, 4)
      .map((c) => ({ token: c.token, penalty: c.distance === 1 ? 0.7 : 0.5 }));
  }

  search(query: string, limit = 20): SearchHit[] {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const totalDocuments = this.lengths.size;
    if (totalDocuments === 0) return [];
    const averageLength = this.averageLength();
    const scores = new Map<string, { score: number; matched: Set<string> }>();

    for (const term of terms) {
      for (const { token, penalty } of this.resolveTerm(term)) {
        const postings = this.postings.get(token);
        if (!postings) continue;
        const df = this.documentFrequency.get(token) ?? 1;
        // Ponderation inverse : un terme rare discrimine mieux qu un terme courant.
        const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
        for (const posting of postings) {
          const length = this.lengths.get(posting.documentId) ?? averageLength;
          const saturation =
            (posting.frequency * (K1 + 1)) /
            (posting.frequency + K1 * (1 - B + (B * length) / averageLength));
          const entry = scores.get(posting.documentId) ?? { score: 0, matched: new Set<string>() };
          entry.score += idf * saturation * posting.fieldWeight * penalty;
          entry.matched.add(token);
          scores.set(posting.documentId, entry);
        }
      }
    }

    return [...scores.entries()]
      .map(([id, entry]) => ({
        id,
        score: Math.round(entry.score * (this.boosts.get(id) ?? 1) * 1000) / 1000,
        matched: [...entry.matched],
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}
