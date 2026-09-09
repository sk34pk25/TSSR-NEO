# Etat du projet TSSR NEO

> Ce document est la memoire du projet. Il ne contient **aucun secret**.
> Il doit toujours etre verifie contre le depot reel avant d etre cru sur parole.

**Derniere mise a jour :** 2026-09-09 (refonte de l experience, V0.3)
**Version du Core :** 0.3.0
**Version des contrats :** 1
**Version de l API Core exposee aux modules :** 1.0.0

---

## Statut general

Fondations construites et verifiees de bout en bout. L application est fonctionnelle en local :
un parcours complet de diagnostic, de reparation et de documentation a ete execute dans un navigateur reel.

**Production en ligne :** https://sk34pk25.github.io/TSSR-NEO/

Le depot public est `sk34pk25/TSSR-NEO`. Le pipeline d integration continue passe toutes ses portes
et publie automatiquement sur GitHub Pages depuis `main`.

---

## Implemente et verifie

### Contrats (`core/contracts`)

Schemas Zod versionnes pour : primitives reseau, competences, topologie, systemes, Active Directory,
virtualisation, cloud, materiel, gestion des services, assertions, missions, monde, evenements,
progression, sauvegardes, instantanes, connaissances, modules, configuration, synchronisation, export.

DSL d assertions : 28 types de verifications executables, composables par `all` / `any` / `not`.

### Simulation

| Paquet               | Etat                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sim-network`        | complet et teste : IPv4, VLAN, ARP, routage, pare-feu, NAT, DNS, DHCP avec relais, arbre recouvrant, routage dynamique, fondation IPv6 avec decouverte de voisins, ping, traceroute, console d equipement |
| `sim-systems`        | complet et teste : systeme de fichiers, droits POSIX et ACL, comptes, services, terminal bash et PowerShell                                                                                               |
| `sim-itsm`           | complet : matrice de priorite, delais, incidents majeurs, changements avec regles d approbation                                                                                                           |
| `sim-monitoring`     | complet : sondes contre l etat reel, alertes, correlation                                                                                                                                                 |
| `sim-hardware`       | complet : brassage creant de vrais liens, LED derivees, pannes de composants                                                                                                                              |
| `sim-backup`         | complet : copie reelle, integrite, chaines incrementales, restauration et test de restauration                                                                                                            |
| `sim-virtualization` | fonctionnel : capacite, contention, instantanes, clones, panne d hote                                                                                                                                     |
| `sim-cloud`          | fonctionnel : hierarchie, provisionnement, couts simules, audit d exposition                                                                                                                              |
| `sim-deployment`     | fonctionnel : deploiement de masse, echecs controles, retour arriere                                                                                                                                      |
| `sim-remote`         | fonctionnel : sessions dependant du DNS, du routage, du pare-feu et des droits                                                                                                                            |
| `sim-world`          | facade unique composant tous les moteurs                                                                                                                                                                  |

### Core

| Paquet           | Etat                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `events`         | generateur deterministe, empreintes, bus d evenements avec journal, horloge simulee                                |
| `evaluation`     | evaluateur d assertions, score multidimensionnel                                                                   |
| `mission-engine` | variantes parametriques, registre de scenarios, deroulement de mission, indices, evenements dynamiques, debrief    |
| `storage`        | adaptateurs memoire et IndexedDB, sauvegardes scellees, instantanes, reprise apres incident, export/import verifie |
| `progression`    | experience, niveaux, rangs, badges, maitrise, repetition espacee, difficulte adaptative, prerequis                 |
| `rendering`      | detection de capacites, profils de qualite, vue reseau, scene 3D et campus                                         |
| `permissions`    | politique serialisable, refus prioritaire, portee par proprietaire et par groupe, prise de controle a usage unique |
| `sync`           | file persistante, idempotence, tentatives espacees, fusion de conflit sans perte, fournisseur HTTP reel            |
| `audio`          | quatre bus sur Web Audio, sons synthetises, six lits d ambiance transitables, degradation propre                   |
| `classroom`      | cohorte locale, analyses de competences et de missions, points faibles classes                                     |
| `rendering`      | abstraction Scene3D, implementation Three.js chargee paresseusement, campus, materiel, controleur de camera        |
| `rendering` (V2) | bibliotheque de materiaux, kit modulaire instancie, compaction des boites de meme materiau                        |

### Savoir

`knowledge` : index BM25 local, tolerance aux fautes par distance de Damerau-Levenshtein,
graphe de connaissances, detection de cycles, recommandations, generation de sessions de revision.

`nova` : mentor deterministe hors ligne, regles socratiques par type d assertion, reponses issues des
fiches du module, presence decroissante avec l experience, observations proactives.

### Application

Navigation ramenee a **quatre lieux** : Accueil, Apprendre, Laboratoire, Campus. Une cinquieme
entree apparait le temps d une mission, parce qu elle a alors un contenu reel. « Apprendre »
regroupe le catalogue, les fiches, les revisions et le releve de progression.

Prise en main en quatre etapes au premier passage, rejouable depuis les reglages. Accueil qui
propose une seule suite, deduite de l etat reel du profil et du deroulement en cours. Ecrans de
supervision, tickets, cockpit formateur, reglages, diagnostics et « A propos » atteignables sans
occuper la barre. Centre de commande `Ctrl+K`. Mode developpeur pour les mesures de rendu.
PWA installable avec service worker a cache versionne. Frontiere d erreur : aucun ecran blanc.

### Module de demonstration

`neo-training-lab` : site complet (commutateur, routeur inter-VLAN, serveur d infrastructure, deux postes),
mission a solutions multiples, deux variantes parametriques, quatre competences, six fiches de connaissances.

---

## Tests

**164 tests unitaires et d interface**, plus les verifications de bout en bout
sur cinq configurations, tous au vert.

| Fichier                              | Portee                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `tests/network-engine.test.ts`       | segmentation VLAN, routage, filtrage, DNS, DHCP, determinisme                   |
| `tests/network-advanced.test.ts`     | relais DHCP, arbre recouvrant, routage dynamique, IPv6 et decouverte de voisins |
| `tests/terminal.test.ts`             | droits, tubes, redirections, elevation, coherence avec le reseau                |
| `tests/mission-training-lab.test.ts` | contrats, variantes, deroulement, solutions alternatives, echec, score          |
| `tests/core-services.test.ts`        | sauvegarde, reprise, progression, connaissances, NOVA                           |
| `tests/hardware-3d.test.ts`          | campus, collisions, materiel derive de la simulation, brassage                  |
| `tests/campus-direction-artistique.test.ts` | criteres visuels minimaux du campus et cout de rendu                    |
| `tests/subsystems.test.ts`           | permissions, synchronisation, audio, cockpit formateur                          |
| `tests/ui/components.test.tsx`       | panneaux React et accessibilite en environnement DOM                            |
| `tests/e2e/parcours.spec.ts`         | fumee, parcours complet, accessibilite, captures visuelles                      |

Voir `docs/testing-e2e.md` pour la campagne de bout en bout et le statut des
captures visuelles.

### Verification manuelle en navigateur

Effectuee sur le serveur de developpement, dans un navigateur reel :

- parcours complet de la mission de demonstration, du diagnostic a la documentation du ticket,
  avec six objectifs sur six valides et un debrief multidimensionnel ;
- le terminal refuse bien une commande non implementee et affiche l adressage reel ;
- la console d equipement revele l ecart de VLAN et le corrige sur la topologie ;
- les douze ecrans se rendent sans erreur, y compris les replis honnetes lorsqu aucune
  infrastructure n est chargee ;
- aucun debordement horizontal en disposition etroite, la mise en page passe en une colonne.

**Non verifiable dans cet environnement :** l enregistrement du service worker echoue dans le
navigateur integre de l outil de developpement, qui bloque la recuperation du script. Le fichier est
pourtant servi correctement en `text/javascript`. Le fonctionnement hors ligne doit donc etre
confirme sur un navigateur classique ou apres publication.

---

## Performance

Construction de production, tailles compressees :

| Element                        | Mesure   | Budget  | Marge |
| ------------------------------ | -------- | ------- | ----- |
| JavaScript initial             | 158,1 Ko | 320 Ko  | 51 %  |
| CSS initial                    | 3,8 Ko   | 60 Ko   | 94 %  |
| Chargement initial, total      | 163,5 Ko | 400 Ko  | 59 %  |
| Moteur 3D, charge a la demande | 119,4 Ko | 200 Ko  | 40 %  |
| Tout le contenu servi          | 291,8 Ko | 1200 Ko | 76 %  |

Le moteur graphique forme un bloc separe : il n est telecharge qu a l ouverture
du campus ou de la vue materielle, et n est pas precache lors de la premiere
visite. Le budget distingue explicitement le chemin critique des blocs
paresseux, sans quoi une regression sur le chargement initial passerait inapercue.

## Securite et confidentialite

- Aucun secret dans le depot, aucune variable d environnement sensible requise.
- Aucun traqueur, aucune publicite, aucune donnee personnelle collectee.
- La telemetrie technique reste locale ; aucun point de collecte distant n est configure.
- La simulation n accede jamais a la machine reelle ni au reseau local de l utilisateur.
- Supabase n est pas active : la plateforme fonctionne integralement en local-first.

---

## Etat du deploiement

| Element              | Etat                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Depot GitHub         | `sk34pk25/TSSR-NEO`, public (Pages exige un depot public en offre libre) |
| Branche principale   | `main`, historique complet pousse, tag `core-0.1.0-baseline`             |
| Integration continue | verte des la premiere execution, toutes portes passees                   |
| GitHub Pages         | actif, source « GitHub Actions »                                         |
| URL de production    | https://sk34pk25.github.io/TSSR-NEO/                                     |
| Sous-chemin          | verifie : routes, ressources, manifeste et service worker                |

### Verification sur l URL de production

- les douze routes se rendent sans erreur sous le sous-chemin `/TSSR-NEO/` ;
- le service worker s enregistre et s active, portee `/TSSR-NEO/` ;
- les douze ressources livrees sont precachees des le **premier** chargement ;
- toutes les ressources referencees par la coquille sont servables depuis le cache seul :
  un lancement hors ligne aboutit ;
- la version de cache est derivee du contenu et invalide automatiquement l ancienne.

**Anomalie trouvee et corrigee sur production :** les ressources n etaient mises en cache qu au
second chargement, ce qui aurait fait echouer un tout premier lancement hors ligne. Un greffon de
construction injecte desormais la liste reelle des fichiers livres dans le service worker.

## Limitations reelles connues

1. **Le banc d essai 3D n a tourne que sur une machine** (Apple M2). La
   degradation sur materiel modeste et sur mobile reste a mesurer.
2. **Le routage IPv6 entre prefixes n est pas simule.** Adressage, lien-local,
   auto-configuration et decouverte de voisins le sont ; le message d erreur
   annonce lui-meme cette limite.
3. **L arbre recouvrant est une abstraction** : racine elue, ports bloques,
   boucle neutralisee. L echange de trames de configuration n est pas reproduit.
4. **Le routage dynamique est une abstraction a vecteur de distance** : pas de
   temporisateurs ni de format de message propre a un protocole existant.
5. **Aucun service de synchronisation n est configure.** Le fournisseur HTTP est
   du code reel et fonctionnel, mais sans point de service il se declare
   indisponible et la file attend sans perte.
6. **Le cockpit formateur ne connait que cet appareil.** Les profils de
   demonstration sont signales comme tels et ne peuvent pas etre confondus avec
   des apprenants reels.
7. **Les captures visuelles ne sont pas une porte de publication** : un rendu
   Linux et un rendu macOS different toujours. Elles sont versionnees par
   plateforme et comparees a la demande.
8. **Pas de multijoueur ni de mode classe en direct.**
9. **Internationalisation partielle** : les contrats acceptent des textes
   multilingues, l interface est uniquement en francais.
10. **Aucun vrai cours pedagogique.** Le NEO Training Lab reste le seul module
    visible ; il valide le Core, il ne l enseigne pas.
11. **Le campus n a ni personnages ni animations.** Le son, lui, suit desormais
    la piece ou se trouve le visiteur ; il reste inactif tant que l utilisateur
    ne l a pas explicitement autorise, comme l exige tout navigateur.
12. **L interaction sur place couvre deux gestes seulement** : utiliser un poste
    et consulter une baie. Examiner un cable et parler a quelqu un n existent pas.
13. **Le mobilier est entierement procedural**, construit a partir de
    primitives. Aucune chaine d assets externes sous licence n est en place.

## Etat des documents prives

Aucun document source prive n a ete fourni, utilise ou publie.

---

## Prochaine action recommandee

Poursuivre la phase 6 bis, dans cet ordre :

1. **couche de vie** : presence humaine et mouvement, le son etant deja branche ;
2. **elargir l interaction sur place** : examiner un cable, manipuler le
   brassage, dialoguer avec un personnage ;
3. **conduire une intervention entiere depuis le campus**, la piece courante
   servant de contexte a la mission.

Le premier vrai cours pedagogique reste attendu via le
`TSSR NEO Course Builder Master Prompt`. Le Core est pret a le recevoir.

Deux chantiers restent ouverts sans dependance :

1. mesurer le banc d essai 3D sur du materiel modeste et sur mobile, afin de
   completer l ADR 0002 sur la degradation ;
2. brancher un service de synchronisation reel, la file et la fusion de conflit
   etant deja testees.
