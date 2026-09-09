# Feuille de route TSSR NEO

Chaque phase indique ses dependances, ses criteres de fin et ses risques.
Une fonctionnalite n est declaree terminee que si elle satisfait la definition de fin
(section finale de ce document).

---

## Phase 1 — Fondations _(terminee)_

Contrats versionnes, moteur reseau, moteur systeme et terminal, moteurs metier, moteur de mission,
stockage et reprise, progression, connaissances, NOVA, application, module de demonstration.

Criteres atteints : 81 tests au vert, parcours complet valide dans un navigateur reel,
budgets de performance respectes avec 56 % de marge.

---

## Phase 2 — Publication _(terminee)_

| Tache                                  | Etat                                                |
| -------------------------------------- | --------------------------------------------------- |
| Depot distant `sk34pk25/TSSR-NEO`      | cree et pousse, historique complet                  |
| Integration continue                   | verte des la premiere execution                     |
| GitHub Pages                           | actif, source « GitHub Actions »                    |
| Verification production et sous-chemin | douze routes, ressources, manifeste, service worker |
| Precache et lancement hors ligne       | corrige et verifie sur l URL reelle                 |

URL de production : https://sk34pk25.github.io/TSSR-NEO/

---

## Phase 3 — Couverture de qualite

| Tache                             | Dependance                    | Critere de fin                                                     |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Tests de composants React         | environnement DOM pour Vitest | rendu et interactions des panneaux couverts                        |
| Tests d accessibilite automatises | tests de composants           | navigation clavier et roles verifies                               |
| Captures visuelles comparees      | publication                   | bureau, tablette, mobile, echelles d interface                     |
| Agent de test joueur              | tests de composants           | debutant, expert, hors ligne, reprise apres incident, clavier seul |

Risque : des tests fragiles ralentiraient le developpement.
Attenuation : cibler les comportements observables, jamais les details d implementation.

---

## Phase 4 — Decision et integration 3D

| Tache                                          | Dependance   | Critere de fin                                             |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------- |
| Executer le banc d essai sur materiel varie    | aucune       | mesures consignees dans l ADR 0002                         |
| Trancher le moteur                             | banc d essai | ADR 0002 passe en accepte                                  |
| Implementer le rendu 3D derriere l abstraction | decision     | campus et baie navigables, aucun changement du code metier |
| Chargement progressif des ressources 3D        | rendu 3D     | budget de premiere visite toujours respecte                |
| Modes de camera contextuels                    | rendu 3D     | transitions fluides, jamais desorientantes                 |

Risque principal : degrader les priorites superieures pour de la qualite graphique.
Attenuation : les budgets de performance sont une porte bloquante de la publication.

---

## Phase 5 — Enrichissement de la simulation

| Tache                           | Valeur pedagogique                       | Critere de fin                                                                 |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Relais DHCP                     | eleve : cas tres frequent en entreprise  | un client obtient un bail via un relais, et le diagnostic explique son absence |
| Spanning tree                   | moyen : explique les boucles de couche 2 | une boucle est bloquee, pas seulement detectee                                 |
| Routage dynamique simplifie     | moyen                                    | convergence apres coupure de lien                                              |
| IPv6                            | eleve a terme                            | adressage, decouverte de voisins, double pile                                  |
| Active Directory approfondi     | eleve                                    | strategies de groupe appliquees avec ordre de precedence                       |
| Sonde de temperature et energie | faible                                   | mesures coherentes avec la charge                                              |

---

## Phase 6 — Comptes et synchronisation

| Tache                                             | Dependance                  | Critere de fin                                               |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| Implementer `core/sync`                           | contrats de synchronisation | fusion multi-appareils avec resolution de conflit            |
| Implementer `core/permissions`                    | roles                       | invite, apprenant, formateur, administrateur                 |
| Integration Supabase                              | **compte externe requis**   | migrations versionnees, securite au niveau des lignes testee |
| Migration de la progression invite vers un compte | synchronisation             | aucune perte de donnees                                      |
| Prise de controle administrateur initiale         | permissions                 | procedure a usage unique, verrouillee apres emploi           |

Contrainte permanente : la plateforme doit rester **entierement jouable sans compte**.

---

## Phase 7 — Contenu et outillage pedagogique

Modules de cours supplementaires, editeur de laboratoire complet, journee de travail simulee,
mode examen configurable, mode classe, collaboration multi-roles, audio, internationalisation anglaise.

---

## Dette technique suivie

| Element                                              | Impact                                                       | Traitement prevu                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `core/permissions` et `core/sync` vides              | aucun aujourd hui, ils ne sont importes nulle part           | phase 6                                                             |
| Pas de tests de composants                           | regression d interface possible                              | phase 3                                                             |
| Journal d evenements borne a 5000 entrees            | perte d evenements non significatifs sur tres longue session | acceptable, les evenements significatifs sont toujours conserves    |
| Le cockpit formateur n affiche que l apprenant local | fonctionnalite annoncee comme limitee dans l ecran           | phase 6                                                             |
| Cache npm local au depot                             | contournement d un cache global appartenant a root           | corriger la cause sur la machine, puis retirer la ligne de `.npmrc` |

---

## Definition de fin

Une fonctionnalite est terminee uniquement si elle est :

fonctionnelle, integree au reste du produit, testee, accessible, sure, performante, documentee,
sauvegardable lorsque cela a du sens, utilisable hors ligne lorsque cela a du sens,
sans bouton factice et sans tache critique restante.
