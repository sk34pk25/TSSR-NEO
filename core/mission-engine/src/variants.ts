import type { MissionDefinition, VariantSpec } from '@tssr/contracts';
import type { Rng } from '@tssr/events';

export type VariantParams = Record<string, string | number | boolean>;

/**
 * Substitution parametrique "{{cle}}".
 * Une meme mission peut ainsi exister en plusieurs variantes de difficulte comparable,
 * sans dupliquer sa definition.
 */
export function substitute<T>(value: T, params: VariantParams): T {
  const json = JSON.stringify(value);
  const replaced = json.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    const replacement = params[key];
    if (replacement === undefined) return match;
    const text = String(replacement);
    // La valeur est reinjectee dans du JSON : on echappe les guillemets.
    return text.replace(/"/g, '\\"');
  });
  return JSON.parse(replaced) as T;
}

export function applyVariant(definition: MissionDefinition, variant: VariantSpec | undefined): MissionDefinition {
  if (!variant) return definition;
  return substitute(definition, variant.parameters);
}

/** Selection reproductible d une variante a partir de la graine de session. */
export function pickVariant(definition: MissionDefinition, rng: Rng): VariantSpec | undefined {
  if (definition.variants.length === 0) return undefined;
  return rng.pickWeighted(definition.variants.map((v) => ({ item: v, weight: v.weight })));
}

export function findMissingPlaceholders(definition: MissionDefinition): string[] {
  const json = JSON.stringify(definition);
  const found = new Set<string>();
  for (const match of json.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    const key = match[1];
    if (key !== undefined) found.add(key);
  }
  return [...found];
}
