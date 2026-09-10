# Dependances tierces

TSSR NEO est publie sous licence MIT. Aucune dependance payante n est requise.

## Dependances d execution

| Paquet           | Licence | Usage                              |
| ---------------- | ------- | ---------------------------------- |
| react, react-dom | MIT     | interface utilisateur              |
| zod              | MIT     | validation des contrats de donnees |

## Dependances de developpement

| Paquet                                                        | Licence    | Usage                                    |
| ------------------------------------------------------------- | ---------- | ---------------------------------------- |
| typescript                                                    | Apache-2.0 | verification de types                    |
| vite, @vitejs/plugin-react                                    | MIT        | construction et serveur de developpement |
| vitest, @vitest/coverage-v8                                   | MIT        | tests                                    |
| eslint, typescript-eslint, eslint-plugin-react-hooks, globals | MIT        | analyse statique                         |
| prettier                                                      | MIT        | formatage                                |

## Outils de developpement charges a la demande

Le banc d essai `scripts/bench-3d` charge Three.js (MIT) et Babylon.js (Apache-2.0) depuis un CDN
public **uniquement lors d une mesure manuelle**. Ces bibliotheques ne sont pas incluses dans
l application publiee et ne sont pas des dependances du projet.

## Ressources graphiques

Toutes les ressources visuelles de TSSR NEO (logo, symbole, favicon, iconographie, palette) sont
originales et produites pour ce projet. Aucun asset payant n est requis. Aucun logo de marque tierce
n est utilise.

## Marques et affiliation

Les technologies, protocoles et commandes reels sont cites lorsqu ils sont pedagogiquement pertinents.
Les interfaces de TSSR NEO sont originales : elles ne reproduisent au pixel pres aucun produit existant.

TSSR NEO n est affilie, associe, autorise ni approuve par aucun des editeurs, constructeurs ou
organismes dont les technologies sont citees.

## Modeles tridimensionnels

Les modeles vivent dans `assets/3d/`. Chaque entree du registre
(`core/rendering/src/asset-registry.ts`) declare sa licence, son auteur et sa
source ; `tests/assets-3d.test.ts` verifie que le fichier existe, qu il reste
dans les limites de poids, et qu aucun asset n est utilise sans licence.

| Collection                | Licence                    | Auteur | Source                                       | Contenu                                        |
| ------------------------- | -------------------------- | ------ | -------------------------------------------- | ---------------------------------------------- |
| Furniture Kit             | CC0 1.0 (domaine public)   | Kenney | https://kenney.nl/assets/furniture-kit       | mobilier de bureau, sieges, rangements, plantes |
| Blocky Characters         | CC0 1.0 (domaine public)   | Kenney | https://kenney.nl/assets/blocky-characters   | six personnages animes et leurs textures        |

**Modifications apportees :** aucune. Les fichiers sont repris tels quels ;
seules l echelle et l orientation sont ajustees a l execution, d apres la
hauteur reelle declaree dans le registre.

La licence CC0 n exige aucune attribution. Elle figure ici parce que citer ses
sources est la regle du depot, et parce que la tracabilite d un asset doit
rester verifiable.
