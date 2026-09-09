# ADR 0001 — Monorepo modulaire avec paquets source

Statut : accepte
Date : 2026-09-09

## Contexte

TSSR NEO doit rester extensible par modules de cours autonomes, tout en garantissant des frontieres
architecturales strictes et une construction rapide. Les modules ne doivent jamais contourner le Core
ni dupliquer sa logique.

## Decision

Monorepo npm workspaces avec des paquets **sans etape de construction** : chaque paquet expose
directement `src/index.ts`. La resolution passe par des alias declares une seule fois dans
`config/aliases.ts`, partages par Vite et Vitest, et refletes dans `tsconfig.json`.

Les frontieres sont verifiees par `scripts/check-architecture.mjs`, execute dans `npm run verify`
et dans l integration continue.

## Consequences

Positives :

- aucune etape de compilation intermediaire, donc iteration rapide et navigation directe dans les sources ;
- une seule source de verite pour les alias, impossible a desynchroniser entre outils ;
- les regles de couches sont executables, pas seulement documentees.

Negatives et attenuations :

- les paquets ne sont pas publiables tels quels sur un registre ; ce n est pas un objectif du projet ;
- l ajout d un paquet demande trois gestes (repertoire, alias, chemin tsconfig) ; le verificateur
  d architecture signale immediatement un oubli.
