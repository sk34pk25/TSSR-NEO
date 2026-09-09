# Securite et confidentialite

## Confidentialite

- Aucune publicite, aucun traqueur, aucune analyse comportementale.
- Le mode invite ne demande aucune identite.
- La progression reste sur l appareil, dans IndexedDB, tant que l utilisateur ne demande rien d autre.
- La telemetrie technique (cadence, erreurs de chargement) reste locale. Aucun point de collecte
  distant n est configure, et le reglage correspondant l indique explicitement.
- L export et l import de progression sont a la main de l utilisateur, dans un format lisible et verifie.

## Limites strictes de la simulation

La plateforme **ne scanne jamais** la machine reelle du joueur et **n accede jamais** a son reseau local.
Tout l inventaire, toutes les adresses et tous les equipements affiches proviennent du monde simule.

## Orientation defensive

Le contenu de securite est exclusivement defensif : durcissement, segmentation, gestion des
privileges, journaux, detection d anomalie, reponse a incident, remediation, sauvegarde et
restauration, investigation. Aucune technique offensive n est enseignee ni outillee.

## Secrets

Aucun secret n est present dans le depot. Lorsque Supabase sera active :

- seules l URL du projet et la cle publique anonyme pourront figurer cote client ;
- aucune cle de service ne doit jamais apparaitre dans le code de l application ;
- la securite au niveau des lignes est obligatoire et testee ;
- le frontal n est jamais considere comme une source d autorite pour les permissions.

## Integrite des donnees

Les sauvegardes et les exports sont scelles par une empreinte verifiee au chargement. Un fichier
altere est refuse avec une raison lisible plutot que charge silencieusement.

Les ecritures de stockage sont transactionnelles : une transaction interrompue ne laisse jamais un
etat partiel visible.

## Reprise apres incident

Un marqueur de session ouverte permet de detecter un arret anormal. Au redemarrage, la plateforme
propose l etat coherent le plus recent, et se rabat sur le dernier point de controle sain si la
sauvegarde automatique est corrompue.
