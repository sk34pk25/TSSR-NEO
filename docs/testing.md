# Strategie de test

## Principe

Les tests portent sur des **comportements observables**, jamais sur des details d implementation.
Un test qui casse doit signaler une regression pedagogique ou technique reelle.

## Ce qui est couvert aujourd hui

| Suite                  | Ce qu elle protege                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `network-engine`       | la segmentation VLAN isole reellement, une panne produit la bonne cause, le determinisme est preserve   |
| `terminal`             | les droits sont appliques, une commande absente est refusee, l aide ne promet rien de faux              |
| `mission-training-lab` | les contrats sont respectes, plusieurs solutions sont acceptees, le score reflete la methode            |
| `core-services`        | une sauvegarde alteree est detectee, la progression n est jamais purgee, la recherche tolere les fautes |

## Tests notables

**L aide ne ment pas.** Le test parcourt toutes les commandes listees par `aide` et les execute :
aucune ne doit repondre qu elle n existe pas. C est la garantie automatisee du principe
d absence de fonctionnalite factice.

**Le determinisme est verifie.** Deux moteurs initialises avec la meme graine produisent des
resultats de ping strictement identiques, perte de paquets comprise.

**Les solutions alternatives sont acceptees.** Le test rebranche le poste sur un autre port du bon
VLAN au lieu de corriger la configuration : les objectifs techniques passent quand meme.

**Les degats collateraux sont detectes.** Arreter un service hors perimetre fait echouer l objectif
de securite, avec une explication lisible.

## Scenarios de validation

`tests/fixtures/campus-network.ts` est un site fictif independant de tout cours reel, utilise
uniquement pour eprouver les moteurs.

## Portes de qualite

```bash
npm run verify   # types, lint, frontieres architecturales, tests
```

L integration continue ajoute la construction et les budgets de performance. Un depassement de
budget bloque la publication.

## Lacunes assumees

Composants React, service worker, accessibilite automatisee et captures visuelles ne sont pas
encore couverts. Voir la phase 3 de `docs/roadmap.md`.
