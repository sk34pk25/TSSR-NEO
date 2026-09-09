# Fonctionnement des moteurs de simulation

## Reseau

### Couche 2

`floodDomain` propage une trame depuis une interface et renvoie tout ce qu elle atteint,
ainsi que **les points de blocage**, qui constituent la matiere du diagnostic :

| Blocage                       | Signification pedagogique                     |
| ----------------------------- | --------------------------------------------- |
| `port-disabled`               | port administrativement desactive             |
| `node-powered-off`            | equipement hors tension                       |
| `link-disconnected`           | cable debranche ou lien coupe                 |
| `no-link`                     | aucun cable raccorde a ce port                |
| `tagged-frame-on-access-port` | trame taguee recue sur un port d acces        |
| `vlan-not-allowed-on-trunk`   | VLAN non transporte par le trunk              |
| `vlan-not-declared-on-switch` | VLAN absent de la base du commutateur         |
| `vlan-mismatch`               | incoherence de VLAN entre les deux extremites |
| `no-matching-subinterface`    | aucune sous-interface pour ce VLAN            |

Le tag d une trame est determine **au port d entree du commutateur**, pas sur l hote : un port
d acces tague la trame avec son VLAN, un trunk conserve le tag ou applique le VLAN natif.

### Couche 3

La table de routage effective combine les routes connectees, derivees automatiquement des
interfaces, et les routes declarees. La recherche se fait au plus long prefixe, puis a la metrique
la plus faible. Les routes connectees ne sont jamais saisies a la main dans un scenario.

`forwardPacket` renvoie une trace complete : chaque saut, l interface de sortie, la latence, la
decision de filtrage et, en cas d echec, une cause lisible.

### Services

`connectToService` separe explicitement trois causes d echec : le reseau ne passe pas,
aucun service n ecoute, ou une dependance du service est indisponible. Cette distinction est
exactement celle qu un technicien doit apprendre a faire.

`resolveName` traverse reellement le reseau pour joindre le serveur DNS, suit les chaines CNAME et
les redirecteurs, et distingue `no-resolver`, `resolver-unreachable`, `service-down` et `nxdomain`.

`requestDhcpLease` diffuse dans le domaine de couche 2, selectionne un serveur de facon
deterministe, respecte les reservations par adresse MAC, et bascule en auto-configuration
`169.254.x.y` en l absence de reponse.

## Systemes

Un modele de droits unique couvre les deux familles : mode POSIX cote Linux, listes de controle
d acces cote Windows avec **priorite au refus explicite**. Un compte privilegie contourne le
controle, comme dans la realite.

Le redemarrage ne relance que les services en demarrage automatique : c est ce qui rend evaluable
la difference entre demarrer un service et le rendre persistant.

## Materiel

Le brassage cree et detruit de vrais liens dans la topologie. Une alimentation en panne, lorsqu il
n en reste aucune fonctionnelle, eteint l equipement. Une carte reseau en panne desactive l interface
correspondante.

## Sauvegarde

Le contenu des fichiers est reellement copie et une empreinte est calculee. Une restauration
incrementale reconstitue toute sa lignee jusqu a la sauvegarde complete, et echoue explicitement si
un point parent a ete supprime par la politique de retention. Une sauvegarde jamais testee est
signalee par NOVA.
