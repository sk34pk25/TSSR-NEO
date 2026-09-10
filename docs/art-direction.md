# Direction artistique — TSSR NEO

Ce document fixe ce qui entre dans le monde et ce qui n y entre pas. Il existe
parce qu un decor incoherent coute plus cher qu un decor pauvre : melanger des
personnages stylises, du mobilier realiste et des textures photographiques
produit un ensemble que rien ne tient.

---

## 1. Intention

**Simulateur professionnel moderne, semi-realiste.**

Ce que cela veut dire concretement :

- les silhouettes sont naturelles et immediatement reconnaissables ;
- les proportions sont justes, mesurees en metres reels ;
- les surfaces sont propres sans etre neuves ;
- l eclairage est celui d un batiment tertiaire, pas d un studio.

Ce que cela exclut :

| Refuse                          | Pourquoi                                                  |
| ------------------------------- | ---------------------------------------------------------- |
| Aspect cubique dominant         | c est le reproche principal fait aux versions precedentes  |
| Science-fiction                 | NEO Systems est une entreprise ordinaire, pas un vaisseau  |
| Photorealisme obligatoire       | son cout ne sert pas l apprentissage                       |
| Cartoon assume                  | il decredibiliserait le materiel, qui doit etre exact      |

---

## 2. Regle de priorite

**Le materiel pedagogique est toujours plus detaille que le decor.**

Un commutateur doit montrer ses vingt-quatre ports, ses temoins et sa
ventilation, parce que c est l objet du cours. Une plante en pot peut rester
sommaire. En cas d arbitrage de performance, c est le decor qui cede.

Ordre decroissant de soin :

1. equipements reseau : baies, commutateurs, panneaux de brassage, prises, cordons ;
2. postes de travail : ecran, clavier, souris, siege ;
3. personnages ;
4. mobilier ;
5. accessoires ;
6. exterieur.

---

## 3. Echelle

Toute dimension est exprimee en metres reels, et le registre d assets declare
la hauteur voulue de chaque objet. La taille du fichier importe peu : deux
bibliotheques n emploient pas la meme unite, et c est la hauteur declaree qui
fait foi.

Reperes tenus par les verifications automatiques :

| Objet              | Hauteur |
| ------------------ | ------- |
| Personne debout    | 1,75 m  |
| Plan de bureau     | 0,74 m  |
| Siege de bureau    | 1,02 m  |
| Baie dix-neuf pouces | 2,10 m |
| Unite de baie      | 44,45 mm |
| Porte              | 2,35 m  |
| Plafond            | 3,20 m  |

---

## 4. Palette

Chaude et claire dans les espaces de travail, plus froide dans les locaux
techniques, parce que c est la verite d un batiment : on ne peint pas une salle
machine comme un hall d accueil.

- **Espaces de travail** : murs clairs, bois, moquette, textile. Le canal rouge
  domine ou egale le bleu.
- **Locaux techniques** : beton, dalle antistatique, metal peint. Le bleu peut
  dominer, et c est le seul endroit ou il en a le droit.
- **Accents** : un filet de couleur par zone, imprime et non lumineux. Un
  bandeau emissif pleine couleur ramene immediatement la science-fiction.

Contrainte verifiee automatiquement : au moins six materiaux au-dessus de 0,5
de luminance, et au moins huit tons chauds. Une palette entierement anthracite
a deja produit un batiment qui se lisait comme evacue la nuit.

---

## 5. Geometrie

**Aucune arete parfaitement vive.** Le gros oeuvre et le mobilier regroupes
utilisent un cube adouci d un chanfrein de deux centimetres et demi. C est
mince, et c est precisement ce liseré de lumiere le long des aretes qui separe
un decor construit d un assemblage de boites.

**Irregularite controlee et deterministe.** Les sieges ne sont pas paralleles,
les objets poses ne sont pas centres, les plantes n ont pas la meme taille. La
variation est tiree d une graine fixe : le campus est irregulier de la meme
facon a chaque execution, sinon aucune capture ne serait comparable. Au moins
quarante pour cent du mobilier pose se tient hors des angles droits.

---

## 6. Choix d un asset

Un asset gratuit n est pas un asset acceptable. Grille de decision, dans cet ordre :

1. **Licence** — CC0 de preference, CC-BY sinon. Une licence floue est un refus,
   sans exception et sans discussion.
2. **Style** — proportions justes, silhouette lisible, pas d aspect cubique.
3. **Coherence** — il doit tenir a cote de ce qui existe deja.
4. **Topologie et poids** — un modele de decor depasse rarement 120 Ko.
5. **Textures** — presentes, et embarquees ou explicitement referencees.

Un asset qui ramene l aspect blockout est refuse meme s il est parfait par
ailleurs.

---

## 7. Sources retenues

| Collection                   | Licence | Usage                                    |
| ---------------------------- | ------- | ---------------------------------------- |
| Kenney — Furniture Kit       | CC0 1.0 | mobilier, accessoires, postes de travail |
| Kenney — Blocky Characters   | CC0 1.0 | personnages et leurs animations          |

Le materiel actif n est pas importe : il est construit par programme, parce que
sa geometrie doit correspondre a la realite pedagogique. Un commutateur
vingt-quatre ports doit en montrer vingt-quatre a l unite pres, et aucune
bibliotheque libre ne le garantit.

Toute entree est tracee dans `core/rendering/src/asset-registry.ts`, reprise
dans `THIRD_PARTY_NOTICES.md`, et verifiee par `tests/assets-3d.test.ts`.

---

## 8. Limite assumee

Les personnages restent stylises et anguleux. C est le point faible connu de la
direction artistique actuelle, et il est documente plutot que masque : aucune
source librement telechargeable ne fournit a la fois un humain aux proportions
credibles **et** le jeu complet d animations dont le campus a besoin, sous une
licence non ambigue. Les remplacer sans ces animations ferait reculer
l ensemble.

Ce point est suivi dans `docs/roadmap.md`.

---

## 9. Audio

La musique est **originale et generee par le moteur**, non telechargee : aucune
question de licence, aucun octet ajoute au chargement, et une boucle
parfaitement continue, ce qu un enregistrement ne fait jamais tout a fait.

Elle est lente, basse, sans evenement marquant. Une musique de fond qui se
remarque a echoue. Elle passe sous l ambiance et sous la voix, et s efface de
six decibels pendant un dialogue.
