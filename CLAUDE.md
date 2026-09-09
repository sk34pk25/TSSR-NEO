# TSSR NEO — Constitution du projet

Ce fichier est la reference structurelle du depot. **Toute session Claude Code doit le lire en premier**,
puis consulter `docs/project-state.md` pour connaitre l etat reel et la prochaine action.

---

## 1. Ce qu est TSSR NEO

Plateforme pedagogique de simulation systemes et reseaux, **100 % navigateur**, destinee a la formation
Technicien Superieur Systemes et Reseaux. Organisation fictive : **NEO Systems**. Mentor : **NOVA**.

Le joueur incarne un technicien junior : il diagnostique des pannes, corrige des configurations,
documente des tickets, et progresse par competences mesurees.

---

## 2. Hierarchie des priorites (non negociable)

En cas de conflit entre deux objectifs, cet ordre tranche :

1. exactitude pedagogique et technique
2. comprehension et intuitivite
3. fonctionnalite reelle
4. stabilite
5. securite et confidentialite
6. performance et fluidite
7. realisme de simulation
8. accessibilite
9. qualite graphique et immersion 3D
10. narration et effets visuels

---

## 3. Regle fondamentale : aucune fonctionnalite factice

Il est **interdit** de presenter comme fonctionnel ce qui ne l est pas.

Concretement, dans ce depot :

- une commande non implementee est **refusee explicitement** (`Terminal.unknownMessage`),
  jamais remplacee par une reponse fabriquee ;
- l aide du terminal (`aide`) liste **exactement** les commandes executables, et un test le verifie ;
- toute donnee affichee (supervision, LED, tables de routage, tickets) est **derivee de l etat simule** ;
- un objectif de mission est valide par une **assertion evaluee contre le monde**, jamais par un clic ;
- une fonctionnalite absente est annoncee comme absente (voir le cockpit formateur), jamais peuplee
  de donnees fictives presentees comme reelles ;
- un espace reserve temporaire est autorise en developpement uniquement, et doit figurer dans
  `docs/roadmap.md`.

---

## 4. Architecture et frontieres

Couches, des plus basses aux plus hautes. **Les dependances vont toujours vers le bas.**

| Couche           | Contenu                         | Peut dependre de |
| ---------------- | ------------------------------- | ---------------- |
| 0 — contrats     | `core/contracts`, `core/events` | rien             |
| 1 — simulation   | `simulation/*`                  | couche 0         |
| 2 — core         | `core/*`                        | couches 0 et 1   |
| 3 — savoir       | `nova`, `knowledge`             | couches 0 a 2    |
| 4 — modules      | `modules/*`                     | couches 0 a 3    |
| 5 — applications | `apps/*`                        | tout             |

Regles verifiees automatiquement par `npm run check:arch` :

1. pas de dependance vers une couche superieure ;
2. aucune dependance circulaire entre paquets ;
3. un module de cours ne depend jamais d un autre module de cours ;
4. rien ne depend d une application ;
5. aucun import relatif ne traverse la frontiere d un paquet.

Le code metier **ne depend jamais directement du moteur graphique** : il passe par `core/rendering`.

---

## 5. Contrats de donnees

Tous les contrats vivent dans `core/contracts`, sont valides par Zod et **versionnes**
(`CONTRACTS_SCHEMA_VERSION`). Une rupture de contrat incremente la version et exige une migration.

Ne jamais dupliquer une donnee entre contrats. Exemples de source unique :

- l adressage IP et les services vivent sur le **noeud reseau**, pas sur le systeme ;
- `SystemState.networkNodeId` fait le lien, sans copie ;
- les LED materielles sont **derivees** de l etat des liens et des interfaces.

---

## 6. Determinisme

Toute variabilite passe par `Rng` (`core/events`), initialise par une graine.
Meme graine et memes actions produisent exactement le meme scenario.

Consequence : ne jamais utiliser `Math.random()`, `Date.now()` ou l heure reelle dans la simulation.
Le temps simule est porte par `SimClock` et `EventBus.setSimTime`.

`forwardPacket` est **structurel** (independant du hasard) : c est lui qui sert aux assertions.
`NetworkEngine.ping` applique la perte de paquets via le generateur deterministe : c est la vue joueur.

---

## 7. Style et qualite

- TypeScript strict, avec `exactOptionalPropertyTypes` et `noUncheckedIndexedAccess`.
- Aucun `any` non controle, aucune dependance circulaire, aucun secret dans le depot.
- Code, identifiants, noms de fichiers et API **en anglais**.
- Commentaires, interface et documentation **en francais**, sans caracteres accentues dans le code
  source afin d eviter tout probleme d encodage entre outils.
- Les commentaires expliquent **pourquoi**, pas **quoi**.
- Aucun journal de deboguage laisse dans le code (`no-console`, `warn` et `error` autorises).

Portes de qualite : `npm run verify` (types, lint, architecture, tests), puis
`npm run build` et `npm run check:budget`. La campagne de bout en bout est decrite
dans `docs/testing-e2e.md`.

Le moteur graphique n est importe que par `core/rendering/src/three-renderer.ts`,
charge paresseusement. Aucun autre fichier du depot ne connait Three.js.

---

## 8. Contenu pedagogique

- Une mission accepte **plusieurs strategies valides** lorsqu elles existent techniquement.
- Le debrief distingue toujours **ca fonctionne** et **c est une bonne pratique professionnelle**.
- NOVA pose une **question** avant de donner une piste, et ne livre la solution que par un indice
  explicite dont le cout d autonomie est comptabilise.
- Les indices sont plafonnes par le mode de difficulte.
- Aucune certification, aucun certificat, aucune attestation. Uniquement badges et progression.
- Les technologies reelles peuvent etre citees et les vraies commandes utilisees ; les interfaces
  TSSR NEO restent originales, sans copie au pixel ni usage de logos proteges.

---

## 9. Confidentialite

Aucun traqueur, aucune publicite, aucune donnee personnelle collectee.
Mode invite sans identite. La telemetrie technique reste locale sauf consentement explicite.
La plateforme ne scanne jamais la machine reelle du joueur et n accede jamais a son reseau local.

---

## 10. Avant tout changement important

1. verifier que le depot est sain (`npm run verify`) ;
2. creer une branche dediee ;
3. effectuer le changement ;
4. relancer la verification complete et la construction ;
5. mettre a jour `docs/project-state.md` et `docs/roadmap.md` ;
6. commiter avec un message explicite en francais.

---

## 11. Commandes utiles

```bash
npm run verify        # types + lint + architecture + tests
npm run dev           # serveur de developpement
npm run build         # construction de production
npm run check:budget  # budgets de performance, chemin critique et blocs paresseux
npm run test          # tests unitaires, d integration et d interface
npm run test:e2e:ci   # fumee, parcours et accessibilite
npm run test:visual   # comparaison de captures, propre a la plateforme
npm run test:prod     # fumee sur l URL publiee
```

URL de production : https://sk34pk25.github.io/TSSR-NEO/

Le cache npm est local au depot (`.npmrc`) car le cache global de la machine contient des fichiers
appartenant a root ; ne pas revenir en arriere sans corriger la cause.
