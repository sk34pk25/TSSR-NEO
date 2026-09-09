# Deploiement et retour arriere

## Cible

GitHub Pages, hebergement statique. L application est compatible avec un sous-repertoire :
le chemin de base est injecte par `TSSR_BASE_PATH` et utilise par la construction, le manifeste,
le service worker et le routage par fragment.

## Publication

Le workflow `.github/workflows/ci.yml` execute, dans l ordre :

1. installation des dependances ;
2. verification des types ;
3. analyse statique ;
4. verification des frontieres architecturales ;
5. tests ;
6. construction de production ;
7. budgets de performance ;
8. publication sur GitHub Pages, uniquement depuis la branche principale.

Une etape en echec bloque la publication.

## Prerequis humain

La creation du depot distant et l activation de GitHub Pages necessitent une authentification
GitHub. C est la seule etape qui ne peut pas etre automatisee.

Sur la machine actuelle, l interface en ligne de commande GitHub n est pas installee.
Deux chemins possibles :

```bash
# Option 1 : installer et utiliser l interface GitHub
brew install gh
gh auth login
gh repo create TSSR-NEO --private --source . --push
```

```bash
# Option 2 : depot cree manuellement sur github.com, puis
git remote add origin https://github.com/<compte>/TSSR-NEO.git
git push -u origin main
```

Puis, dans les reglages du depot, activer Pages avec la source « GitHub Actions ».

## Retour arriere

Chaque publication correspond a un commit. Pour revenir en arriere :

1. identifier le dernier commit sain ;
2. republier ce commit via le workflow ;
3. si le service worker a mis en cache une version defectueuse, la version du cache
   (`CACHE_VERSION` dans `public/sw.js`) doit etre incrementee pour forcer le nettoyage.

Les donnees des utilisateurs ne sont pas affectees par un retour arriere : elles vivent localement
et sont validees par contrat au chargement. Une sauvegarde ecrite par une version plus recente
et devenue illisible est refusee proprement, et la reprise se fait sur le dernier point sain.

## Ressources volumineuses

Si des ressources 3D depassent ce qui est raisonnable pour Pages, l ordre a suivre est :
optimiser, puis publier via les releases GitHub, puis envisager un stockage gratuit adapte,
avec des manifestes versionnes et des empreintes d integrite. Aucun document prive ne doit jamais
etre place sur un stockage public.
