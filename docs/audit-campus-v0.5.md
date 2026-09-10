# Audit du campus — V0.5

**Date :** 2026-09-10
**Version auditee :** 0.4 (production, identique au local)
**Methode :** detecteur de defauts analytique (`scripts/crawler-campus.mjs`),
parcours en premiere personne, captures.

> L audit n a pas ete conduit a l oeil. Un personnage enfonce dans une cloison,
> un trou entre deux murs ou un objet flottant sont des faits geometriques :
> ils se verifient sur la description de scene, exhaustivement, sans navigateur
> et sans jugement. C est ce qui a permis de trouver la cause exacte du bug
> bloquant signale.

---

## 1. Ce que le detecteur verifie

| Controle                                   | Methode                                                             |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Personnage dans une geometrie solide       | pourtour du corps echantillonne a trois hauteurs, contre les volumes de collision |
| Personnage hors du batiment                | appartenance a une zone ou au couloir                               |
| Point de passage invalide                  | detection de l origine du monde, et des points dans un obstacle     |
| Trajet traversant un mur                   | chemin reellement emprunte, echantillonne segment par segment       |
| Trou dans une cloison                      | rayons tires le long de chaque mur, tous les 30 cm, a trois hauteurs |
| Pignon de couloir ouvert                   | idem sur les deux extremites                                        |
| Point de depart invalide                   | apparition et entree de chaque piece                                |
| Objet sous le niveau du sol                | position verticale de chaque noeud et de chaque instance            |
| Modele manquant ou non declare             | presence du fichier, et appartenance au registre                    |

---

## 2. Defauts trouves

Sept defauts, tous de priorite maximale, tous reproduits.

### 2.1 Personnages dans les murs — **P0, bug bloquant**

| Personne        | Lieu           | Ce qu il traverse                  |
| --------------- | -------------- | ---------------------------------- |
| Yanis Delorme   | Salle reseau   | `network-room-col-pier-b`, un trumeau de porte |
| Lea Moreau      | Accueil        | `reception-banque-obstacle`, le comptoir |
| Nadia Fournier  | Centre de commandement | `command-center-poste-obstacle-3`, un poste de travail |

**Cause.** Les positions etaient ecrites a la main dans le code et prises telles
quelles. Rien ne verifiait qu un mur ou un meuble s y trouvait. Trois sur six
tombaient dans un solide, ce qui est le taux qu on attend d une methode qui ne
verifie rien.

### 2.2 Point de passage valant l origine du monde — **P0**

```
ronde: [
  dans('network-room', 1.6, 1.8),
  dans('network-room', -2.2, 1.2),
  [0, 0, 0],                        // <- ici
  dans('datacenter', 0, 2.4),
]
```

Ce point etait un raccourci pour faire passer le technicien d une salle a
l autre. Il le placait au centre du couloir, et surtout il n avait aucune
raison d etre franchissable depuis les deux points voisins.

### 2.3 Trajets traversant trois cloisons — **P0**

La ronde du technicien traversait `network-room-col-right`,
`datacenter-col-pier-b` puis `datacenter-col-left`. Le deplacement etait une
interpolation lineaire entre deux coordonnees : aucune notion de chemin
n existait.

### 2.4 Entree du centre de commandement barree — **P0**

Trouve pendant la correction, pas par le detecteur initial : la rangee de
postes de travail occupait l axe de la porte, et l embrasure n etait pas
franchissable. Le joueur pouvait y entrer en glissant le long du mur, un
personnage non.

---

## 3. Ce que le detecteur n a **pas** trouve

Aucun trou de cloison. Les rayons tires le long des trois murs de chacune des
neuf pieces, plus les deux pignons du couloir, rencontrent tous un volume de
collision. Les incoherences visuelles signalees sur les cloisons ne sont donc
pas des ouvertures dans la geometrie : elles relevaient du chevauchement de
volumes et de l absence de chanfrein, traites en tant que tels.

Aucun objet sous le sol, aucun modele manquant, aucun modele non declare.

---

## 4. Corrections apportees

| Defaut                                    | Traitement                                                     |
| ----------------------------------------- | -------------------------------------------------------------- |
| Positions non verifiees                   | espace marchable partage, toute position y est ramenee          |
| Point de passage a l origine du monde      | itineraires exprimes en destinations metier, plus de coordonnees brutes |
| Trajets en ligne droite                   | chemin calcule en A*, sans coupe par l angle de deux murs       |
| Entree de piece barree                    | postes ecartes de l axe de la porte                             |
| Aretes parfaitement vives                 | cube adouci d un chanfrein de 2,5 cm sur tout le decor regroupe |
| Teleportation entre points de passage     | vitesse humaine, rotation progressive, animations en fondu      |

Le detecteur passe de **sept defauts a zero**, et dix-sept verifications
automatiques empechent leur retour, dont une simulation de cinq minutes de vie
du campus qui echoue si quiconque quitte le sol marchable.

---

## 5. Limites connues, non corrigees

1. **Les personnages restent stylises et anguleux.** Aucune source librement
   telechargeable ne fournit a la fois un humain aux proportions credibles et le
   jeu complet d animations necessaire, sous licence non ambigue. Voir
   `docs/art-direction.md`, section 8.
2. **Les materiaux restent des couleurs unies**, sans texture ni carte de
   rugosite. L eclairage n utilise pas d environnement image.
3. **Une baie se consulte mais ne se manipule pas** : ouvrir la porte, brancher
   ou debrancher un cordon reste a faire.
4. **Les personnages ne s evitent pas entre eux.** Deux itineraires qui se
   croisent peuvent se traverser.
