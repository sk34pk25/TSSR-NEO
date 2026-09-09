# Audit UX et visuel — base de reference V0.3

**Date :** 2026-09-09
**Version auditee :** 0.2.0 (production `https://sk34pk25.github.io/TSSR-NEO/`, identique au local)
**Methode :** parcours reel du produit, sans lire la documentation, captures a l appui.
**Captures :** `docs/audit/captures/` — neuf ecrans en 1440x900 et en 390x844,
plus huit captures de traversee du campus en vue subjective.

> Ce document ne defend pas l architecture existante. Il constate.
> Les six reproches formules par le proprietaire sont **tous verifies**, et chacun
> est chiffre ci-dessous. Les tests automatises ne detectaient aucun de ces defauts,
> ce qui est normal : ils verifient que le produit fonctionne, pas qu il est bon.

---

## 1. Verdict resume

| Reproche du proprietaire                     | Verifie | Preuve la plus courte                                                  |
| -------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| Site insuffisamment intuitif                 | oui     | 6 entrees de navigation, dont 3 vides a la premiere visite             |
| Campus 3D trop vide                          | oui     | **0 objet de mobilier sur 105 noeuds** : tout est mur, sol ou plafond  |
| 3D visuellement froide et inquietante        | oui     | **toutes** les surfaces entre 0,05 et 0,15 de luminance, teinte bleue  |
| Trop proche d un tableau de bord technique   | oui     | la 3D est un encart en bas d une page de cartes ; compteurs `img/s`    |
| Immersion insuffisante                       | oui     | aucun son, aucun personnage, aucune animation, aucune interaction      |
| Distinction Campus/Mission/Labo/... difficile | oui     | 4 des 6 entrees sont des **etats internes**, pas des lieux             |

Aucun de ces points n est un detail cosmetique. Pris ensemble, ils font que le
produit se lit comme une console d administration livree avec une maquette 3D,
alors que l intention est un environnement professionnel dans lequel l interface
apparait quand on en a besoin.

---

## 2. Ce que voit reellement un nouvel arrivant

### 2.1 Accueil — `captures/bureau/accueil.png`

Le titre annonce une intention juste : « Apprendre le metier, pas seulement les
commandes ». Ce qui suit la contredit.

Defauts constates :

1. **Trois actions concurrentes de meme poids visuel** — « Entrer dans NEO Systems »,
   « Parcourir les cours », « Laboratoire libre ». Rien ne dit laquelle choisir
   quand on ne connait pas le produit. La seule difference est la couleur du bouton.
2. **La carte « Ou vous en etes » est vide de sens a la premiere visite** : rang
   junior, niveau 1, experience 0, missions 0/1, competences 0. Un tableau de zeros
   est le premier contenu de droite que l oeil rencontre.
3. **La moitie basse de la page explique le moteur, pas le metier.** Quatre cartes
   (« Un reseau qui se comporte comme un vrai reseau », « Un terminal reellement
   interprete », « Une evaluation sur les faits », « Hors ligne et sans traqueur »).
   C est un argumentaire technique adresse a un evaluateur, pas une premiere marche
   adressee a un apprenant.
4. **Aucun accueil, aucune mise en situation, aucun personnage.** NOVA, qui est le
   mentor du produit, n apparait nulle part sur l ecran d entree.

### 2.2 Navigation — presente sur tous les ecrans

`Campus · Mission · Laboratoire · Connaissances · Revision · Progression`

1. **Quatre de ces six entrees ne sont pas des lieux mais des etats** : « Mission »
   n a de contenu que si une mission est en cours ; « Revision » que si une
   competence a ete travaillee ; « Progression » que si de l experience existe ;
   « Laboratoire » que si un bac a sable a ete demarre.
2. **Verifie par capture** : a la premiere visite, `Mission` affiche « Aucune mission
   en cours » (`captures/bureau/mission.png`) et `Revision` affiche « Aucune
   competence suivie pour l instant » (`captures/bureau/revision.png`). Deux
   destinations de premier niveau sur six sont des culs-de-sac au premier clic.
3. **« Campus » et « Laboratoire » se recouvrent** : le campus contient une zone
   nommee « NEO Lab Builder » et une zone « NEO Training Lab », alors que
   « Laboratoire » est aussi une entree de la barre. Le meme mot designe trois choses.
4. **« Connaissances » et « Revision » sont deux faces d un meme geste** (consulter,
   puis se tester) separees en deux destinations.
5. Le vocabulaire melange le francais et l anglais de marque sans regle lisible :
   `Connaissances` dans la barre, mais `NEO Knowledge` en titre de page ;
   `Revision` dans la barre, `NEO Review` en titre.

### 2.3 Campus — `captures/bureau/campus.png`

C est ici que l ecart est le plus grand entre l intention et le resultat.

Avant d atteindre la 3D, l utilisateur traverse, dans cet ordre :

1. un titre `Campus NEO Systems` ;
2. un paragraphe d explication ;
3. un titre `Cours disponibles` ;
4. **une carte de cours** — c est-a-dire un catalogue, sans rapport avec un lieu ;
5. un titre `Zones du site` ;
6. un second paragraphe d explication ;
7. **enfin**, la vue 3D, en encart, a 560 pixels du haut de page.

La 3D est donc litteralement le sixieme element d un document. Le produit se
presente comme un site contenant une petite vue 3D — exactement le diagnostic
du proprietaire. Le catalogue de cours et le lieu physique sont melanges dans
le meme ecran alors qu ils repondent a deux questions differentes
(« qu est-ce que j apprends ? » et « ou suis-je ? »).

La barre superieure de l encart affiche `57 img/s · 59 appels · 1k triangles`.
**Des compteurs de rendu sont exposes a un apprenant en formation TSSR.** Ils
n ont aucun sens pour lui et signent immediatement le prototype technique.

### 2.4 Campus en vue subjective — `captures/campus-subjectif/`

C est l epreuve decisive, et le campus la rate.

- **`01-apparition.png`** : le joueur apparait au bout d un couloir sombre, face a
  une enfilade de portes identiques. Sept etiquettes flottantes se chevauchent au
  centre exact du champ de vision, formant un amas illisible
  (`Centre de commandement` par-dessus `NEO Knowledge` par-dessus `Espace personnel`).
- **`05-couloir-milieu.png`** : murs gris, sol gris, plafond noir, deux bandeaux
  cyan. Rien d autre. Aucun objet, aucun repere, aucune profondeur de champ visuelle.
- **`06-face-a-une-porte.png`** : en regardant une salle a travers sa vitre, on voit
  **une piece entierement vide**. Aucun bureau, aucun ecran, aucune baie, aucune chaise.
- **`08-fond-du-couloir.png`** : le couloir se termine sur un mur noir. Au-dela des
  murs, il n y a pas de monde : pas de sol exterieur, pas de ciel, pas de fenetre.
  Le campus est une boite fermee posee dans le vide.

Ressenti honnete : cela evoque un batiment evacue la nuit, pas un lieu de travail.
Le mot « inquietant » employe par le proprietaire est le bon mot.

---

## 3. Causes chiffrees, dans le code

### 3.1 Le campus n a aucun mobilier — 0 sur 105

Mesure sur `buildCampusScene()` (`core/rendering/src/campus.ts`) :

```
noeuds total 105 | ancres 9 | colliders 47
roles : floor 10, ceiling 10, back 9, left 9, right 9,
        pier-a 9, pier-b 9, lintel 9, door 9, sign 9,
        corridor-light 11, mur-ouest 1, mur-est 1
```

**Chaque noeud de la scene est un element de gros oeuvre.** Il n existe pas une
seule table, une seule baie, un seul ecran, un seul cable, une seule chaise, une
seule plante, un seul panneau, une seule personne. Neuf salles de 8 x 8 metres
strictement identiques, distinguees uniquement par la couleur d un bandeau lumineux.

Le prompt V0.3 enonce qu « un campus constitue essentiellement de cubes, murs et
bandeaux lumineux echoue automatiquement ». Le campus actuel est *exclusivement*
cela. Il ne s agit pas d un campus insuffisamment meuble : c est un **blockout**,
c est-a-dire l etape qui precede normalement la construction du decor.

### 3.2 Toute la palette est froide et sombre — sans exception

Palette integrale du campus (`MATERIALS`, valeurs lineaires 0-1) :

| Surface  | R     | V     | B     | Observation                          |
| -------- | ----- | ----- | ----- | ------------------------------------ |
| sol      | 0,070 | 0,080 | 0,095 | bleu > rouge                         |
| couloir  | 0,085 | 0,095 | 0,115 | bleu > rouge                         |
| mur      | 0,115 | 0,125 | 0,150 | bleu > rouge — surface la plus claire |
| plafond  | 0,050 | 0,055 | 0,070 | bleu > rouge                         |
| verre    | 0,200 | 0,350 | 0,450 | franchement cyan                     |
| brouillard | 0,020 | 0,030 | 0,045 | quasi noir                         |

Deux constats mecaniques :

1. **La surface la plus claire de tout le campus est a 0,15.** Il n existe aucune
   valeur claire, donc aucun contraste possible : tout se lit comme une masse sombre.
2. **Aucune teinte chaude n existe dans le fichier.** Sur les six materiaux, les six
   ont un canal bleu superieur au canal rouge. Il n y a pas un seul bois, un seul
   beige, un seul textile, un seul blanc casse.

Les quatre lumieres aggravent la teinte plutot que de la corriger :

```
hemisphere  [0,32 0,40 0,55] intensite 0,42   -> bleue
directionnelle [0,85 0,88 0,95] intensite 0,55 -> blanc bleute
ponctuelle x2  [0,45 0,72 1,00] intensite 6    -> cyan pur
```

Il n y a **aucune source chaude dans la scene**. Le commentaire du code dit
« un local technique n est pas un studio » : l intention etait la sobriete, le
resultat est l hypothermie. Un vrai batiment tertiaire est majoritairement eclaire
en blanc neutre a chaud, avec des surfaces claires ; ici tout est cyan sur anthracite.

### 3.3 Le mode par defaut cache le peu qui existe

`Campus3D.tsx` demarre en `mode = 'tactical'`, une vue de dessus plafonds escamotes.
La consequence est double : le premier contact avec le campus est un **plan**, pas
un lieu ; et la vue subjective — la seule qui puisse produire de l immersion —
est un onglet parmi quatre que rien n incite a essayer.

### 3.4 Rien ne vit, rien ne s utilise

- Aucun son : `core/audio` existe et fonctionne, mais le campus ne l appelle pas.
- Aucun personnage, aucune animation, aucun mouvement d aucune sorte.
- **Aucune interaction contextuelle.** Les seules cibles cliquables sont les portes
  (27 noeuds interactifs de types `zone`, `door`, `sign`). On ne peut pas utiliser un
  poste, ouvrir une baie, examiner un cable, inspecter un commutateur, parler a
  quelqu un. Le campus n est qu un menu spatialise.
- **Entrer dans une zone quitte la 3D** et bascule vers un ecran React classique.
  L environnement n est donc jamais un lieu de travail : c est un vestibule.

### 3.5 Aucun accueil n existe

Recherche exhaustive dans `apps/web/src` : aucune occurrence de `onboarding`,
`didacticiel`, `tutoriel`, `firstRun` ni equivalent. **Il n y a strictement aucune
prise en main.** L utilisateur est depose sur une page d accueil avec trois boutons
concurrents et six entrees de navigation dont il ignore le sens, sans une phrase
lui disant ou il est, qui il est, et ce qu on attend de lui.

C est la cause premiere du « insuffisamment intuitif » : ce n est pas que les ecrans
soient mal faits, c est qu aucun ne se presente.

---

## 4. Confrontation aux criteres visuels minimaux du prompt V0.3

| Critere exige                                  | Etat actuel | Preuve                                             |
| ---------------------------------------------- | ----------- | -------------------------------------------------- |
| Salles reconnaissables sans etiquette          | **echec**   | 9 salles geometriquement identiques                |
| Mobilier coherent avec la fonction de la salle | **echec**   | 0 objet de mobilier dans la scene                  |
| Eclairage chaud et professionnel               | **echec**   | 4 lumieres, toutes froides ; aucune source chaude  |
| Materiaux varies                               | **echec**   | 6 materiaux, tous anthracite bleute                |
| Echelle humaine credible                       | partiel     | hauteurs correctes, mais volumes vides             |
| Sensation d espace habite                      | **echec**   | aucun personnage, aucun objet, aucun son           |
| Repere spatial sans HUD                        | **echec**   | orientation impossible sans les etiquettes         |
| Interaction contextuelle                       | **echec**   | seules les portes reagissent                       |
| Interface qui s efface                         | **echec**   | HUD permanent affichant `img/s` et `appels`        |
| Aucun cube nu comme decor principal            | **echec**   | 105 noeuds sur 105 sont des boites                 |

Dix criteres, neuf en echec franc. Le campus actuel echoue au test enonce par le
prompt : « un campus constitue essentiellement de cubes, murs et bandeaux lumineux
echoue automatiquement ».

---

## 5. Ce qui n est pas en cause

Il faut le dire aussi clairement, parce que cela conditionne le plan de travail :
**la refonte ne doit rien casser de ce qui suit**, qui est sain et verifie.

- La simulation reseau, systeme, ITSM, supervision, materiel et sauvegarde.
- Le moteur de mission, les assertions evaluees contre l etat, le score et le debrief.
- Le terminal reellement interprete et la console d equipement.
- Le stockage, la reprise apres incident, la progression, la repetition espacee.
- La base de connaissances BM25 et le mentor NOVA deterministe.
- L abstraction `core/rendering` : elle est correcte, c est **la scene decrite** qui
  est pauvre, pas le moyen de la decrire. `Scene3D` accepte deja plusieurs
  geometries, des materiaux completes, des lumieres et des noeuds interactifs.
- Le respect de la regle « aucune fonctionnalite factice » : rien de ce qui est
  affiche n est invente.

Autrement dit, le probleme n est pas la fondation. Le probleme est que **le produit
expose sa fondation au lieu d exposer une experience**.

---

## 6. Consequence pour le plan V0.3

L audit conduit a six chantiers, dans cet ordre de dependance :

1. **Architecture de l information** — ramener la navigation a quatre concepts
   utilisateur, et supprimer les destinations qui sont des etats.
2. **Accueil et prise en main** — un premier contact qui situe le joueur, presente
   NOVA, et mene a une premiere action evidente.
3. **Direction artistique** — une palette chaude et claire, des materiaux varies,
   un eclairage credible ; c est un prerequis a toute modelisation.
4. **Campus V2** — architecture reelle, salles distinctes, mobilier coherent, monde
   au-dela des murs.
5. **Interaction contextuelle** — utiliser un poste, ouvrir une baie, examiner un
   cable, parler a quelqu un, sans quitter systematiquement la 3D.
6. **Vie et ambiance** — sons par zone, presence humaine, mouvement.

Le detail des jalons est tenu dans `docs/roadmap.md`.

---

## 7. Etat de reference conserve

Les captures de `docs/audit/captures/` constituent la reference « avant ». Elles
sont regenerables :

```bash
node scripts/capture-audit.mjs          # neuf ecrans, deux formats
node scripts/capture-campus-walk.mjs    # traversee du campus en vue subjective
```

Toute affirmation de progres en V0.3 devra etre comparee a ces images, et non a
l etat des tests. Une integration continue verte ne dit rien de la qualite de
l experience.
