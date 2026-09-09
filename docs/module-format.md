# Format d un module TSSR NEO

Un module est un paquet autonome de la couche 4. Il ne depend jamais d un autre module.

## Structure minimale

```text
modules/<identifiant>/
├── package.json          nom @tssr/module-<identifiant>
└── src/
    ├── scenario.ts       construit un WorldState deterministe
    ├── mission.ts        une ou plusieurs MissionDefinition
    ├── knowledge.ts      competences et fiches de connaissances
    └── index.ts          ModuleManifest, CourseManifest et exports
```

## Manifeste

```ts
export const monManifeste: ModuleManifest = {
  schemaVersion: 1,
  id: 'mon-module',
  version: '1.0.0',
  name: 'Nom affiche',
  description: 'Ce que le module apprend.',
  compatibility: { coreApi: '>=1.0.0 <2.0.0', contractsSchemaVersion: 1 },
  competencies: [...],
  missionIds: [...],
  knowledgeEntryIds: [...],
  scenarioIds: [...],
  offlineCapable: true,
  license: 'MIT',
  authors: ['NEO Systems'],
  approximateSizeBytes: 0,
  assets: [],
};
```

La compatibilite declaree est verifiee : un module concu pour une API anterieure ne doit jamais
casser silencieusement.

## Scenario

Un scenario est une fonction pure `(seed, params) => WorldState`. Il ne doit contenir **aucun hasard**
en dehors de la graine recue. Utiliser `TopologyBuilder` et `createSystem` pour rester concis.

## Mission

Une mission decrit ses objectifs par des **assertions**, evaluees contre l etat reel du monde.
Regles a respecter :

- accepter toutes les strategies techniquement valides via `any` ;
- inclure au moins un objectif de securite, typiquement `unchanged` sur un element hors perimetre ;
- proposer des indices de niveau 1 a 4, du questionnement socratique a la solution partielle ;
- documenter dans le debrief ce qui fonctionne **et** ce qui constitue une bonne pratique ;
- fournir des variantes parametriques lorsque cela ne change pas la competence visee.

## Verification

Un module correct satisfait :

```ts
zModuleManifest.safeParse(monManifeste).success;
zMissionDefinition.safeParse(maMission).success;
zWorldState.safeParse(monScenario.build({ seed: 1, params: {} })).success;
findMissingPlaceholders(applyVariant(maMission, variante)).length === 0;
```

Ces quatre verifications figurent dans `tests/mission-training-lab.test.ts` et servent de modele.
