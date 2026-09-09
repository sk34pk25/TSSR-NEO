/**
 * Generateur pseudo-aleatoire deterministe (mulberry32).
 * Toute variabilite de TSSR NEO passe par ici : meme graine => meme scenario.
 */
export class Rng {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError('Rng.int: max < min');
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: liste vide');
    const value = items[this.int(0, items.length - 1)];
    return value as T;
  }

  /** Tirage pondere ; les poids doivent etre strictement positifs. */
  pickWeighted<T>(items: readonly { item: T; weight: number }[]): T {
    if (items.length === 0) throw new RangeError('Rng.pickWeighted: liste vide');
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let roll = this.next() * total;
    for (const entry of items) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return (items[items.length - 1] as { item: T; weight: number }).item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** Etat courant : permet de sauvegarder et reprendre exactement la meme sequence. */
  snapshot(): { seed: number; state: number } {
    return { seed: this.initialSeed, state: this.state };
  }

  static restore(snapshot: { seed: number; state: number }): Rng {
    const rng = new Rng(snapshot.seed);
    rng.state = snapshot.state >>> 0;
    return rng;
  }
}

/** Derive une graine stable a partir d une chaine (nom de mission, variante...). */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
