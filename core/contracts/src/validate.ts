import type { z } from 'zod';

export class ContractError extends Error {
  readonly issues: readonly { path: string; message: string }[];

  constructor(schemaName: string, issues: readonly { path: string; message: string }[]) {
    super(
      `Contrat "${schemaName}" invalide :\n` +
        issues.map((i) => `  - ${i.path || '(racine)'} : ${i.message}`).join('\n'),
    );
    this.name = 'ContractError';
    this.issues = issues;
  }
}

/** Parse strict : leve une ContractError lisible plutot qu une trace Zod brute. */
export function parseContract<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  schemaName: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ContractError(
    schemaName,
    result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export type ContractResult<T> =
  { ok: true; value: T } | { ok: false; issues: { path: string; message: string }[] };

/** Variante non levante, utilisee a l import de donnees utilisateur. */
export function safeParseContract<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): ContractResult<z.infer<T>> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
