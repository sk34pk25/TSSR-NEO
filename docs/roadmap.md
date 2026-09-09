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

## Phase 3 — Couverture de qualite _(terminee)_

| Tache                        | Etat                                                |
| ---------------------------- | --------------------------------------------------- |
| Tests de composants React    | onze tests d interface en environnement DOM         |
| Accessibilite automatisee    | analyse sur chaque ecran, clavier, focus visible    |
| Captures visuelles comparees | cinq configurations, versionnees par plateforme     |
| Fumee sur la production      | executee apres chaque deploiement, sur l URL reelle |

Les captures visuelles restent hors porte de publication : un rendu Linux et un
rendu macOS different toujours, et en faire une porte produirait de faux echecs.
Voir `docs/testing-e2e.md`.

---

## Phase 4 — Decision et integration 3D _(terminee)_

| Tache                               | Etat                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| Banc d essai execute                | quatre configurations mesurees, garde-fous de validite      |
| Moteur tranche                      | Three.js, WebGL 2 par defaut, ADR 0002 accepte              |
| Rendu derriere l abstraction        | seul `three-renderer.ts` importe une bibliotheque graphique |
| Chargement paresseux                | bloc separe de 119 Ko, hors chargement initial              |
| Campus navigable et modes de camera | neuf zones, quatre modes, transitions douces                |

Reste ouvert : mesurer la degradation sur materiel modeste et sur mobile.

---

## Phase 5 — Enrichissement de la simulation _(largement terminee)_

| Tache                       | Etat                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| Relais DHCP                 | fait et teste, avec causes d echec distinctes                    |
| Arbre recouvrant            | fait : racine elue, ports bloques, connectivite preservee        |
| Routage dynamique           | fait : abstraction a vecteur de distance, convergence et retrait |
| Fondation IPv6 et voisinage | fait : adressage, lien-local, auto-configuration, decouverte     |
| Routage IPv6 entre prefixes | **non fait**, annonce explicitement par le moteur                |
| Active Directory approfondi | non commence                                                     |

---

## Phase 6 — Comptes et synchronisation _(fondations posees)_

| Tache                           | Etat                                                            |
| ------------------------------- | --------------------------------------------------------------- |
| `core/permissions`              | fait : politique serialisable, rejouable par un service distant |
| `core/sync`                     | fait : file persistante, idempotence, fusion de conflit         |
| Fondation audio                 | fait : quatre bus, degradation propre                           |
| Cockpit formateur et admin      | fait, sur donnees locales explicitement etiquetees              |
| Service de synchronisation reel | **en attente** : aucun point de service configure               |
| Migration invite vers compte    | en attente du service                                           |

Contrainte permanente : la plateforme reste entierement jouable sans compte.

---

## Phase 6 bis — Experience produit et refonte 3D _(en cours, V0.3)_

Declenchee par un constat du proprietaire sur la production : site insuffisamment
intuitif, campus vide, 3D froide, experience trop proche d un tableau de bord.
L audit est tenu dans `docs/audit-ux-v0.3.md`, captures a l appui.

| Jalon                                   | Etat                                                            |
| --------------------------------------- | ---------------------------------------------------------------- |
| Audit UX et visuel, captures de base    | fait : neuf ecrans, deux formats, traversee en vue subjective    |
| Architecture de l information           | fait : quatre lieux, mission contextuelle, catalogue deplace     |
| Prise en main au premier passage        | fait : quatre etapes, rejouables depuis les reglages             |
| Refonte de l accueil                    | fait : une seule suite proposee, deduite de l etat reel          |
| Bibliotheque de materiaux et kit modulaire | fait : quarante materiaux, mobilier instancie                 |
| Campus V2 : architecture et amenagement | fait : pieces distinctes, meublees, ouvertes sur l exterieur     |
| Eclairage                               | fait : jour dominant, appoint chaud, rebond de sol               |
| Compaction du rendu                     | fait : cinq cent quinze noeuds ramenes a cent soixante-quinze    |
| Interaction contextuelle                | **non fait** : utiliser un poste, ouvrir une baie, examiner      |
| Couche de vie : personnages, animations | **non fait**                                                     |
| Audio par zone                          | **non fait** : le moteur existe, le campus ne l appelle pas      |
| Travail sur place sans quitter la 3D    | **non fait**                                                     |
| Chaine d assets externes sous licence   | **non fait** : le mobilier est procedural, voir la dette         |

---

## Phase 7 — Contenu et outillage pedagogique

Modules de cours supplementaires, editeur de laboratoire complet, journee de travail simulee,
mode examen configurable, mode classe, collaboration multi-roles, audio, internationalisation anglaise.

---

## Dette technique suivie

| Element                                      | Impact                                                    | Traitement prevu                        |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Banc d essai 3D sur une seule machine        | la degradation sur materiel modeste reste inconnue        | mesurer sur mobile et machine ancienne  |
| Captures visuelles hors porte de publication | une regression visuelle peut passer entre deux executions | comparer a la demande avant une release |
| Aucun service de synchronisation             | pas de suivi multi-appareils                              | phase 6, des qu un service existe       |
| Journal d evenements borne a 5000 entrees    | perte d evenements non significatifs sur longue session   | acceptable, les significatifs restent   |
| Cache npm local au depot                     | contournement d un cache global appartenant a root        | corriger la cause sur la machine        |
| Mobilier entierement procedural              | moins de variete qu une bibliotheque d assets modelises   | chaine d assets CC0 si le besoin se confirme |
| Campus sans personnages ni son               | l espace reste habite par le decor seul                   | couche de vie, phase 6 bis              |

## Definition de fin

Une fonctionnalite est terminee uniquement si elle est :

fonctionnelle, integree au reste du produit, testee, accessible, sure, performante, documentee,
sauvegardable lorsque cela a du sens, utilisable hors ligne lorsque cela a du sens,
sans bouton factice et sans tache critique restante.
