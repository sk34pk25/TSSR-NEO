# Audit produit — base de reference V0.4

**Date :** 2026-09-10
**Version auditee :** 0.3 (production `https://sk34pk25.github.io/TSSR-NEO/`, identique au local)
**Methode :** parcours de **toutes** les destinations atteignables, sonde automatisee,
campagne de reproduction des defauts 3D, releve de metriques sur le code.
**Artefacts :** `docs/audit/v0.4/releve.json`, `docs/audit/v0.4/captures/` (dix-huit ecrans).
**Regenerable :** `node scripts/audit-produit.mjs` et `node scripts/chasse-bugs-3d.mjs`.

> La V0.3 a corrige des defauts reels. Elle n a pas resolu le probleme de fond :
> le produit reste un ensemble de sous-produits juxtaposes, et le monde reste
> un assemblage de primitives alignees. Ce document le constate, chiffres a l appui.
> Une integration continue verte ne dit rien de ces deux points.

---

## 1. Carte de navigation reelle

Dix-huit destinations sont atteignables. **Quatre seulement figurent dans la barre.**

| Destination            | Titre affiche                  | Dans la barre | Vide au premier contact |
| ---------------------- | ------------------------------ | ------------- | ----------------------- |
| `accueil`              | Apprendre le metier...         | oui           | non                     |
| `apprendre`            | Apprendre                      | oui           | non                     |
| `apprendre/cours`      | Apprendre                      | oui           | non                     |
| `apprendre/fiches`     | Apprendre                      | oui           | non                     |
| `apprendre/reviser`    | Apprendre                      | oui           | **oui**                 |
| `apprendre/progression`| Apprendre                      | oui           | **oui**                 |
| `laboratoire`          | Laboratoire libre              | oui           | non                     |
| `campus`               | Campus NEO Systems             | oui           | non                     |
| `mission`              | **aucun titre**                | non           | **oui**                 |
| `a-propos`             | Comment fonctionne TSSR NEO    | non           | non                     |
| `connaissances`        | NEO Knowledge                  | non           | non                     |
| `revision`             | NEO Review                     | non           | **oui**                 |
| `progression`          | Progression                    | non           | **oui**                 |
| `supervision`          | NEO Monitoring                 | non           | **oui**                 |
| `tickets`              | Gestion des services           | non           | **oui**                 |
| `formateur`            | NEO Studio                     | non           | **oui**                 |
| `reglages`             | Reglages                       | non           | non                     |
| `diagnostics`          | NEO Diagnostics                | non           | non                     |

### 1.1 Trois doublons stricts

Le meme contenu est servi par deux adresses differentes :

| Contenu                | Adresse A               | Adresse B         | Preuve                    |
| ---------------------- | ----------------------- | ----------------- | ------------------------- |
| Fiches de connaissances| `apprendre/fiches`      | `connaissances`   | six cartes des deux cotes |
| Session de revision    | `apprendre/reviser`     | `revision`        | meme composant            |
| Releve de progression  | `apprendre/progression` | `progression`     | meme composant            |

La V0.3 a regroupe ces ecrans sous « Apprendre » **sans supprimer les anciennes
adresses**. Le produit expose donc simultanement les deux modeles, l ancien et le
nouveau. C est une dette introduite par la refonte precedente, pas un heritage.

### 1.2 Sept ecrans atteignables uniquement par `Ctrl+K`

`mission`, `connaissances`, `revision`, `progression`, `supervision`, `tickets`,
`formateur`. Un utilisateur qui ignore l existence du centre de commande ne les
verra jamais, sauf a passer par un lien contextuel.

### 1.3 Neuf noms de produit distincts

`Campus NEO Systems`, `Apprendre`, `Laboratoire libre`, `NEO Knowledge`,
`NEO Review`, `NEO Monitoring`, `NEO Studio`, `NEO Diagnostics`,
`Gestion des services`. Plus `Progression` et `Reglages`.

Onze etiquettes pour une seule plateforme. Un nouvel arrivant doit donc
construire une carte mentale de onze objets avant de pouvoir travailler, alors
qu il n a besoin que de trois idees : ce que je fais maintenant, ce que
j apprends, ou je travaille.

### 1.4 Huit destinations sur dix-huit n ont rien a dire

Elles affichent leur propre vide au premier contact. La V0.3 a retire deux
impasses de la barre ; elle ne les a pas supprimees, elle les a deplacees.

### 1.5 Un ecran sans titre

`mission` ne comporte **aucun titre de premier niveau**. C est un defaut
d accessibilite autant qu un defaut de reperage.

---

## 2. Ruptures de contexte

| Situation                                   | Ce qui se passe                                            |
| ------------------------------------------- | ---------------------------------------------------------- |
| Cliquer une porte dans le campus            | bascule vers un ecran 2D, la position dans le monde est perdue |
| Revenir au campus apres un autre ecran      | on reapparait au point de depart, pas la ou l on etait     |
| Demarrer une mission depuis l accueil       | on arrive directement sur un plan de travail, sans lieu    |
| Consulter un ticket                         | destination autonome, sans rapport avec l endroit          |
| Consulter la supervision                    | destination autonome, sans rapport avec l endroit          |

La mission ne commence jamais dans le monde. Le monde ne sert jamais a conduire
une mission. Ce sont deux produits qui coexistent.

---

## 3. Le monde reste dessine a la regle

Mesures sur `buildCampusScene()` :

```
noeuds 184 | instances 759
par primitive : { box: 121, cylinder: 45, sphere: 18 }
modeles importes (glTF / GLB) : 0
noeuds orientes hors des angles droits : 0 sur 184
```

Trois constats mecaniques, qui correspondent exactement aux criteres d echec du §47 :

1. **Aucun modele importe.** Cent pour cent de la geometrie est constituee de
   boites, de cylindres et de spheres. La V0.3 a rendu cet assemblage chaud et
   credible en couleur, pas en silhouette.
2. **Aucun objet n est oriente hors des angles droits.** Pas une chaise tournee,
   pas un objet pose de travers. Un lieu reel n a pas cette propriete.
3. **Aucun accessoire secondaire.** Ni tasse, ni bloc-notes, ni carton, ni
   dossier, ni sac. Le mobilier existe ; ce qui traine dessus n existe pas.

S y ajoute la composition : neuf salles rectangulaires alignees de part et
d autre d un couloir strictement rectiligne. Aucune alcove, aucune circulation
secondaire, aucun poteau, aucun decrochement, aucun changement de revetement en
cours d espace.

---

## 4. Defauts 3D reproduits

Neuf scenarios joues (`scripts/chasse-bugs-3d.mjs`). Tiennent : les collisions,
la perte de focus, le redimensionnement, l ouverture et la fermeture d un outil,
le relachement de souris hors zone, le rendu mobile, et le repli sans WebGL.

Defauts reels trouves :

| # | Defaut                                                            | Consequence                                            |
| - | ----------------------------------------------------------------- | ------------------------------------------------------ |
| 1 | **La position dans le monde n est pas conservee** en quittant la 3D | on repart du hall a chaque retour                      |
| 2 | **Aucune touche ne fait tourner la camera**                        | les fleches font un pas de cote ; sans souris, on ne peut pas regarder autour |
| 3 | **L aide affichee est fausse** : elle annonce que les fleches deplacent, sans dire comment tourner | l utilisateur cherche une commande qui n existe pas |
| 4 | **Aucune inertie** : la vitesse passe de zero au maximum en une image | c est l origine de la sensation de camera robotique   |
| 5 | **La rotation n est pas rapportee au temps ecoule**                | la vitesse de rotation depend de la cadence d affichage |
| 6 | **Se deplacer depuis une vue d inspection bascule en troisieme personne** | on change de point de vue sans l avoir demande   |

Les deux premiers sont bloquants pour un usage au clavier seul.

---

## 5. Le produit ressemble encore a un tableau de bord

- **214 styles en ligne** repartis sur **23 fichiers** : il n existe pas de
  systeme de composants, seulement des reglages ponctuels repetes.
- Onze composants seulement dans `apps/web/src/components`, dont trois sont des
  vues 3D. Il n existe ni en-tete de page, ni etat vide, ni panneau contextuel,
  ni tiroir, ni puce d etat reutilisables.
- La reponse a presque toute question d interface est la meme : un rectangle
  borde avec un titre et du texte. Le releve compte jusqu a sept cartes sur un
  seul ecran.
- Aucune iconographie : le produit ne dispose d aucun jeu d icones.

---

## 6. Ce qui n est pas en cause

La refonte ne doit rien casser de ce qui suit, qui est sain et verifie :
la simulation reseau, systeme, ITSM, supervision, materiel et sauvegarde ; le
moteur de mission et ses assertions evaluees contre l etat ; le terminal
reellement interprete ; le stockage et la reprise ; la base de connaissances ; le
mentor NOVA ; l abstraction `core/rendering` ; les budgets de performance.

Le probleme n est pas la fondation. Le probleme est que **le produit expose
encore son decoupage interne au lieu d exposer un metier**, et que **le monde
n a pas encore de silhouettes**.

---

## 7. Chantiers qui en decoulent

1. **Modele mental a trois entrees** : Accueil, Parcours, NEO Systems. Supprimer
   les doublons d adresses, pas seulement les masquer.
2. **Parcours unifie** : une progression lisible ou fiches, revisions et maitrise
   apparaissent au moment ou elles servent.
3. **Mission integree au monde** : elle commence par un ticket, dans un lieu,
   aupres de quelqu un.
4. **Contextualiser tickets et supervision** : sur des ecrans, dans des pieces.
5. **Chaine d assets glTF reelle**, avec licences tracees, et remplacement des
   silhouettes principales.
6. **Variation spatiale et imperfection controlee**, deterministe pour les tests.
7. **Materiel reseau credible** et baie reellement manipulable.
8. **Personnages** avec deplacement, etats et dialogues.
9. **Systeme de composants** et fin des styles en ligne.
10. **Correction des six defauts 3D** ci-dessus, avec test de non-regression.
