# ADR 0002 — Choix du moteur 3D

Statut : **accepte** — Three.js, backend WebGL 2 par defaut, WebGPU en option
Date de la decision : 2026-09-09
Mesures : [`docs/benchmarks/2026-09-09-moteurs-3d.json`](../benchmarks/2026-09-09-moteurs-3d.json)

## Contexte

Le cahier des charges impose de ne verrouiller aucun moteur avant un banc d essai representatif,
et exige que le code metier ne depende jamais du moteur graphique. La 3D occupe la position 9 de la
hierarchie des priorites : elle ne doit degrader ni la stabilite (4), ni la performance (6).

## Protocole

Une scene unique, identique pour chaque moteur, decrite dans `scripts/bench-3d/scene-spec.js` :
salle technique, quatre baies, quatre-vingts serveurs instancies avec deux niveaux de detail,
quatre commutateurs, quatre panneaux de brassage, quatre-vingt-seize ports, quatre-vingt-seize cables
courbes, poste de travail complet, eclairage PBR a quatre sources, temoins lumineux animes par
instance, selection par pointage, deux cameras alternees, habillage pedagogique projete et
chargement d un fichier GLB genere a l execution. **377 objets logiques.**

Mesure a resolution fixe 1600x900, ratio de pixels force a 1, GPU vide apres chaque rendu.
290 images par configuration, les dix premieres ecartees pour exclure la compilation des nuanceurs.

Deux garde-fous rendent le resultat exploitable :

- **576 pixels lus au centre de l image** apres le premier rendu, pour prouver qu une image reelle a
  ete produite. Une mesure sur un canevas vide aurait donne des temps excellents et faux, et c est
  exactement le piege rencontre lors des premieres executions ;
- **117 draw calls par image sur les deux moteurs en WebGL 2**, ce qui confirme que les scenes sont
  reellement equivalentes et non simplement d apparence similaire.

## Resultats

Apple M2, Chromium, 8 coeurs, 16 Go.

| Moteur     | Backend | Demarrage | p50    | p95    | p99     | Draw calls | Reseau   |
| ---------- | ------- | --------- | ------ | ------ | ------- | ---------- | -------- |
| Three.js   | WebGL 2 | 64 ms     | 0,2 ms | 0,3 ms | 0,4 ms  | 117        | 286 Ko   |
| Babylon.js | WebGL 2 | 91 ms     | 0,4 ms | 0,8 ms | 10,0 ms | 117        | 1175 Ko  |
| Three.js   | WebGPU  | 86 ms     | 1,2 ms | 1,8 ms | 2,2 ms  | 602        | 337 Ko   |
| Babylon.js | WebGPU  | 28 ms     | 1,6 ms | 2,0 ms | 5,2 ms  | 117        | en cache |

## Analyse selon la hierarchie officielle

| Priorite                 | Verdict                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1 exactitude pedagogique | egalite : meme scene, meme nombre de draw calls, meme rendu                                           |
| 2 comprehension          | egalite pour l apprenant ; Babylon.js est plus riche pour le developpeur                              |
| 3 fonctionnalite reelle  | egalite : GLB, LOD, instanciation, pointage, PBR, cameras couverts par les deux                       |
| 4 **stabilite**          | **Three.js** : p99 a 0,4 ms contre 10,0 ms, soit vingt-cinq fois moins de pics                        |
| 5 securite               | egalite                                                                                               |
| 6 **performance**        | **Three.js** : deux fois plus rapide en p50 et quatre fois plus leger au telechargement               |
| 7 realisme               | egalite                                                                                               |
| 8 accessibilite          | **Three.js** : sans interface integree, l habillage passe obligatoirement par le DOM, donc accessible |
| 9 qualite graphique      | **Babylon.js** : chaine de post-traitement et outillage plus fournis d origine                        |
| 10 narration et effets   | **Babylon.js**                                                                                        |

Babylon.js l emporte sur les priorites 9 et 10. Three.js l emporte sur les priorites 4, 6 et 8.
La hierarchie tranche donc en faveur de **Three.js**.

Le poids est determinant : l application complete pese aujourd hui 148 Ko compresses. Babylon.js
ajouterait environ 1,17 Mo, soit huit fois le poids actuel ; Three.js environ 286 Ko, soit trois fois.
Dans les deux cas le moteur sera charge paresseusement, mais l ecart reste structurel.

Le point sur l accessibilite merite d etre explicite : l interface integree de Babylon.js dessine
dans le canevas et reste donc invisible aux lecteurs d ecran. L absence d equivalent chez Three.js
force a construire l habillage en DOM, ce qui est precisement ce qu exige l accessibilite.

## Decision

**Three.js**, avec WebGL 2 comme backend par defaut et WebGPU en option activable.

WebGPU fonctionne chez les deux moteurs mais reste ici plus lent que WebGL 2 sur cette machine
(1,2 ms contre 0,2 ms en p50). Il n est donc pas active par defaut ; la detection de capacites
existante le proposera lorsque la mesure le justifiera sur une machine donnee.

Le moteur est integre **exclusivement derriere l abstraction `core/rendering`**. Aucun module de
cours et aucun moteur de simulation n importe Three.js.

## Limites assumees

- Une seule machine mesuree. La degradation sur materiel modeste et sur mobile reste a mesurer :
  c est une tache ouverte de la feuille de route.
- Les compteurs de draw calls sont definis par chaque moteur. Celui du backend WebGPU de Three.js
  compte les passes differemment (602), ce qui n est pas comparable aux 117 du chemin WebGL.
- Les temps de demarrage sont releves avec cache chaud ; c est le poids reseau qui reflete le cout
  d une premiere visite.
- La cadence rapportee est une cadence theorique hors synchronisation verticale : elle compare les
  moteurs a charge egale, elle ne predit pas une cadence percue.

## Reversibilite

Le choix est encapsule dans une seule implementation de l abstraction de rendu. Changer de moteur
consiste a ecrire une autre implementation derriere la meme interface, sans toucher au code metier,
aux contrats ni aux modules. Le banc d essai reste dans le depot pour rejouer la comparaison.
