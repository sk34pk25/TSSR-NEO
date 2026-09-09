# Accessibilite

L accessibilite est prise en compte des la conception, pas ajoutee ensuite.

## Implemente

| Fonction                    | Mise en oeuvre                                                                   |
| --------------------------- | -------------------------------------------------------------------------------- |
| Navigation clavier          | tous les controles sont natifs et focalisables, avec ordre de tabulation naturel |
| Focus visible               | contour permanent sur `:focus-visible`, jamais supprime                          |
| Lien d evitement            | premier element de la page, vers le contenu principal                            |
| Taille de texte             | quatre paliers, appliques par une variable CSS heritee partout                   |
| Echelle d interface         | reglage continu de 0,85 a 1,4                                                    |
| Contraste renforce          | jeu de jetons alternatif, pas un simple filtre                                   |
| Vision des couleurs         | trois adaptations, remplacant les paires de teintes ambigues                     |
| Reduction d animation       | respecte la preference systeme, et peut etre forcee                              |
| Reduction de complexite     | desactive les fonds composites et le verre depoli                                |
| Regions vivantes            | la sortie du terminal est annoncee aux lecteurs d ecran                          |
| Libelles                    | chaque champ possede un libelle, visible ou reserve aux lecteurs d ecran         |
| Information non chromatique | les etats sont doubles d un texte, jamais portes par la seule couleur            |

## Regles de conception

- La couleur n est jamais le seul porteur d information. Un lien coupe est rouge **et** en pointilles
  **et** decrit textuellement.
- Aucune action ne depend d un survol : le survol enrichit, il ne conditionne pas.
- Les cibles tactiles respectent une hauteur confortable, et l interface s adapte sous 1180 pixels.
- Le terminal possede un bouton d execution explicite : la touche Entree n est pas le seul moyen
  de valider une commande.

## A faire

Tests automatises d accessibilite, verification par lecteur d ecran reel, remappage complet des
raccourcis clavier. Voir la phase 3 de `docs/roadmap.md`.
