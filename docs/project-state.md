# Etat du projet TSSR NEO

> Ce document est la memoire du projet. Il ne contient **aucun secret**.
> Il doit toujours etre verifie contre le depot reel avant d etre cru sur parole.

**Derniere mise a jour :** 2026-09-09
**Version du Core :** 0.1.0
**Version des contrats :** 1
**Version de l API Core exposee aux modules :** 1.0.0

---

## Statut general

Fondations construites et verifiees de bout en bout. L application est fonctionnelle en local :
un parcours complet de diagnostic, de reparation et de documentation a ete execute dans un navigateur reel.

Aucun deploiement n a encore ete effectue : le depot n a pas de remote configure et aucune
authentification GitHub n est disponible dans cette session.

---

## Implemente et verifie

### Contrats (`core/contracts`)

Schemas Zod versionnes pour : primitives reseau, competences, topologie, systemes, Active Directory,
virtualisation, cloud, materiel, gestion des services, assertions, missions, monde, evenements,
progression, sauvegardes, instantanes, connaissances, modules, configuration, synchronisation, export.

DSL d assertions : 28 types de verifications executables, composables par `all` / `any` / `not`.

### Simulation

| Paquet               | Etat                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sim-network`        | complet et teste : IPv4, VLAN, ARP, routage, pare-feu, NAT, DNS, DHCP, ping, traceroute, console d equipement, constructeur de topologie |
| `sim-systems`        | complet et teste : systeme de fichiers, droits POSIX et ACL, comptes, services, terminal bash et PowerShell                              |
| `sim-itsm`           | complet : matrice de priorite, delais, incidents majeurs, changements avec regles d approbation                                          |
| `sim-monitoring`     | complet : sondes contre l etat reel, alertes, correlation                                                                                |
| `sim-hardware`       | complet : brassage creant de vrais liens, LED derivees, pannes de composants                                                             |
| `sim-backup`         | complet : copie reelle, integrite, chaines incrementales, restauration et test de restauration                                           |
| `sim-virtualization` | fonctionnel : capacite, contention, instantanes, clones, panne d hote                                                                    |
| `sim-cloud`          | fonctionnel : hierarchie, provisionnement, couts simules, audit d exposition                                                             |
| `sim-deployment`     | fonctionnel : deploiement de masse, echecs controles, retour arriere                                                                     |
| `sim-remote`         | fonctionnel : sessions dependant du DNS, du routage, du pare-feu et des droits                                                           |
| `sim-world`          | facade unique composant tous les moteurs                                                                                                 |

### Core

| Paquet                | Etat                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `events`              | generateur deterministe, empreintes, bus d evenements avec journal, horloge simulee                                |
| `evaluation`          | evaluateur d assertions, score multidimensionnel                                                                   |
| `mission-engine`      | variantes parametriques, registre de scenarios, deroulement de mission, indices, evenements dynamiques, debrief    |
| `storage`             | adaptateurs memoire et IndexedDB, sauvegardes scellees, instantanes, reprise apres incident, export/import verifie |
| `progression`         | experience, niveaux, rangs, badges, maitrise, repetition espacee, difficulte adaptative, prerequis                 |
| `rendering`           | detection de capacites, profils de qualite, graphe de scene, rendu de la vue reseau                                |
| `permissions`, `sync` | paquets declares, non encore implementes                                                                           |

### Savoir

`knowledge` : index BM25 local, tolerance aux fautes par distance de Damerau-Levenshtein,
graphe de connaissances, detection de cycles, recommandations, generation de sessions de revision.

`nova` : mentor deterministe hors ligne, regles socratiques par type d assertion, reponses issues des
fiches du module, presence decroissante avec l experience, observations proactives.

### Application

Accueil, campus, mission, laboratoire libre, connaissances, revision, progression, supervision,
tickets, cockpit formateur, reglages, diagnostics. Centre de commande `Ctrl+K`. PWA installable avec
service worker a cache versionne. Frontiere d erreur : aucun ecran blanc possible.

### Module de demonstration

`neo-training-lab` : site complet (commutateur, routeur inter-VLAN, serveur d infrastructure, deux postes),
mission a solutions multiples, deux variantes parametriques, quatre competences, six fiches de connaissances.

---

## Tests

81 tests, tous au vert.

| Fichier                              | Portee                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `tests/network-engine.test.ts`       | 23 tests : segmentation VLAN, routage, filtrage, DNS, DHCP, determinisme                   |
| `tests/terminal.test.ts`             | 15 tests : droits, tubes, redirections, elevation, coherence avec le reseau                |
| `tests/mission-training-lab.test.ts` | 17 tests : contrats, variantes, deroulement, solutions alternatives, echec, indices, score |
| `tests/core-services.test.ts`        | 26 tests : sauvegarde, reprise, progression, connaissances, NOVA                           |

Non couvert par des tests automatises a ce jour : composants React, service worker, accessibilite,
captures visuelles. Voir la feuille de route.

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

| Element         | Mesure   | Budget  | Marge |
| --------------- | -------- | ------- | ----- |
| JavaScript      | 141,8 Ko | 320 Ko  | 56 %  |
| CSS             | 3,3 Ko   | 60 Ko   | 94 %  |
| Premiere visite | 147,1 Ko | 1200 Ko | 88 %  |

Aucune bibliotheque 3D n est actuellement embarquee : voir `docs/adr/0002-choix-du-moteur-3d.md`.

---

## Securite et confidentialite

- Aucun secret dans le depot, aucune variable d environnement sensible requise.
- Aucun traqueur, aucune publicite, aucune donnee personnelle collectee.
- La telemetrie technique reste locale ; aucun point de collecte distant n est configure.
- La simulation n accede jamais a la machine reelle ni au reseau local de l utilisateur.
- Supabase n est pas active : la plateforme fonctionne integralement en local-first.

---

## Etat du deploiement

| Element              | Etat                                                      |
| -------------------- | --------------------------------------------------------- |
| Depot Git local      | initialise, plusieurs commits                             |
| Remote GitHub        | **absent** — necessite une authentification humaine       |
| GitHub Pages         | non configure                                             |
| Integration continue | workflow present dans `.github/workflows`, jamais execute |
| URL de production    | aucune                                                    |

---

## Limitations reelles connues

1. **Pas de 3D immersive a ce jour.** L abstraction de rendu existe et la vue reseau est livree ;
   le moteur 3D reste a choisir apres mesure. La 3D est en priorite 9 du cahier des charges.
2. **Cockpit formateur limite a l apprenant local.** Le suivi de classe exige un service de
   synchronisation absent. L ecran l annonce explicitement plutot que d afficher des donnees fictives.
3. **Relais DHCP non simule.** Un serveur DHCP doit se trouver dans le domaine de diffusion du client.
   La consequence est correcte et diagnosticable, mais le relais reste a implementer.
4. **Pas de protocole de routage dynamique.** Routes connectees, statiques et par defaut uniquement.
5. **Spanning tree absent.** Une boucle de couche 2 est detectee et signalee, pas resolue.
6. **`core/permissions` et `core/sync` sont des paquets vides.** Ils sont declares mais sans code.
7. **Pas de multijoueur ni de mode classe.** Architecture prevue, non implementee.
8. **Audio non implemente.** Les preferences existent, aucun son n est joue.
9. **Internationalisation partielle.** Les contrats acceptent des textes multilingues, l interface
   est uniquement en francais.
10. **Aucun test de composant React ni de capture visuelle automatisee.**

---

## Etat des documents prives

Aucun document source prive n a ete fourni, utilise ou publie.

---

## Prochaine action recommandee

Configurer le depot distant et la publication continue :

1. l utilisateur authentifie GitHub (`gh auth login`) ou fournit un depot distant ;
2. pousser la branche principale et activer GitHub Pages sur le workflow existant ;
3. verifier la construction publiee et le fonctionnement hors ligne sur l URL reelle.

En parallele, sans blocage : executer le banc d essai 3D sur du materiel representatif afin de
trancher `docs/adr/0002-choix-du-moteur-3d.md`.
