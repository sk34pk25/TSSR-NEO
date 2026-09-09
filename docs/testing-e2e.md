# Assurance qualite de bout en bout

## Ce qui est verifie

| Famille          | Portee                                                                    | Bloquant en integration continue |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Fumee            | chargement, rendu de chaque ecran, manifeste, service worker, debordement | oui                              |
| Parcours         | diagnostic, correction et verification de bout en bout                    | oui                              |
| Accessibilite    | analyse automatisee sur chaque ecran, clavier, focus visible              | oui                              |
| Visuel           | captures comparees sur cinq configurations                                 | non, voir ci-dessous             |

Cinq configurations sont couvertes : bureau, tablette, mobile, mouvement reduit
et texte agrandi.

## Pourquoi le visuel n est pas une porte de publication

Une capture depend du systeme de rendu de la machine : le meme code produit des
images differentes sous macOS et sous Linux. En faire une porte bloquante
produirait des echecs qui ne signalent aucune regression reelle.

Les references sont donc versionnees par plateforme (`tests/e2e/__captures__/<plateforme>/`)
et la comparaison se lance a la demande :

```bash
npm run test:visual
```

Au premier passage sur une plateforme, les references manquantes sont creees et
la campagne signale leur creation. Les executions suivantes detectent les ecarts.

## Commandes

```bash
npm run test:e2e        # tout, sur la construction locale
npm run test:e2e:ci     # fumee, parcours et accessibilite, sans le visuel
npm run test:visual     # comparaison de captures uniquement
npm run test:prod       # fumee sur l URL publiee
```

La cible est configurable :

```bash
TSSR_TEST_URL=https://sk34pk25.github.io/TSSR-NEO/ npm run test:prod
```

Sans cette variable, un serveur d apercu local est demarre automatiquement sur
la construction de production.

## Regle de non-regression

Toute anomalie trouvee recoit un test avant d etre corrigee. Deux exemples deja
en place :

- le rechargement parasite a la premiere visite, provoque par la prise de
  controle initiale du service worker, a ete decouvert parce qu il detruisait le
  contexte de page pendant l analyse d accessibilite ;
- les barres de progression portaient une etiquette sur un element sans role,
  ce qui est une violation ; elles declarent desormais un vrai role de barre de
  progression avec sa valeur.
