# ADR 0002 — Choix du moteur 3D

Statut : **en attente de mesure** — decision volontairement non verrouillee
Date : 2026-09-09

## Contexte

Le cahier des charges impose une 3D aussi avancee que raisonnable, mais **apres** un banc d essai
representatif comparant Babylon.js, Three.js et toute alternative Web gratuite serieuse.
Il impose egalement que le code metier ne depende jamais du moteur graphique.

La 3D est en position 9 de la hierarchie des priorites : elle ne doit pas etre livree au detriment
de l exactitude pedagogique, de la fonctionnalite reelle ou de la performance.

## Decision provisoire

1. **L abstraction de rendu est livree** (`core/rendering`) et le code metier ne connait aucun moteur.
   Elle expose une detection de capacites reelles, des profils de qualite, un graphe de scene simple
   et un rendu concret.
2. **Le premier rendu concret livre est la vue reseau**, en Canvas 2D, sans dependance externe.
   C est la surface visuelle a plus forte valeur pedagogique : elle montre la segmentation VLAN,
   l etat des liens et le trajet reellement calcule d un paquet.
3. **Le choix du moteur 3D reste ouvert** tant que le banc d essai n a pas ete execute sur du
   materiel representatif, y compris une machine modeste.

## Banc d essai

`scripts/bench-3d/index.html` execute une scene identique sur chaque moteur : baie instanciee,
materiau PBR, deux lumieres, camera en rotation, selection par pointage. Il mesure le temps
d initialisation, la cadence moyenne, la cadence du centile bas, la memoire JavaScript et le poids reseau.

Ouvrir le fichier avec un serveur statique local, par exemple :

```bash
npx --yes http-server scripts/bench-3d -p 8081
```

## Criteres de decision

Le moteur retenu devra, sur machine modeste, tenir environ 30 images par seconde sur la scene de
reference, et 60 sur machine courante, tout en respectant :
rendu PBR, eclairage, chargement glTF/GLB, instanciation, selection par pointage, physique
contextuelle, integration d interface, chemin WebGPU avec repli WebGL propre, empreinte memoire,
poids ajoute au chargement initial, maintenance du projet amont, compatibilite avec le mode hors ligne.

## Consequences

- Aucune bibliotheque 3D n est actuellement une dependance du projet : le poids initial reste a
  environ 142 Ko compresses de JavaScript, tres en dessous du budget de 320 Ko.
- Le passage a un moteur 3D complet consistera a ajouter une implementation derriere l abstraction
  existante, sans toucher au code metier ni aux contrats.
- Tant que la mesure n a pas eu lieu, aucune affirmation n est faite sur les performances comparees.
