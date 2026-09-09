# Architecture de TSSR NEO

## Principe directeur

Une seule source de verite pour l etat du monde, plusieurs vues sur cet etat.
Le terminal, la vue reseau, les tickets, la supervision, NOVA et l evaluation observent
strictement le meme objet. Une modification faite par l un est immediatement visible par tous.

## Couches

```text
couche 5   apps/web                        interface
couche 4   modules/*                       contenu pedagogique
couche 3   nova, knowledge                 mentor et base de connaissances
couche 2   core/*                          mission, evaluation, progression, stockage, rendu
couche 1   simulation/*                    moteurs techniques
couche 0   core/contracts, core/events     contrats et primitives deterministes
```

Les dependances vont toujours vers le bas. `npm run check:arch` echoue sinon.

## Flux d une action du joueur

```text
saisie de commande
   -> Terminal (sim-systems)          interprete la commande
   -> NetworkEngine / SystemEngine    mutent WorldState et emettent un evenement
   -> EventBus                        journalise l evenement
   -> MissionRunner.tick()            reevalue toutes les assertions
   -> evaluation                      renvoie reussite ou explication de l ecart
   -> interface                       objectifs, vue reseau, tickets et NOVA se mettent a jour
```

Aucun raccourci n existe : il n y a pas de chemin par lequel un objectif pourrait etre valide
sans que l etat du monde le justifie.

## Points de conception notables

**Les services vivent sur le noeud reseau, pas sur le systeme.** `SystemState.networkNodeId`
etablit le lien. Consequence : `systemctl stop` cote Linux et un test de port depuis un poste Windows
lisent la meme donnee, sans synchronisation possible a oublier.

**Les LED materielles sont derivees.** `HardwareEngine.refreshLeds` les recalcule a partir de l etat
des liens et des interfaces. Elles ne peuvent donc jamais mentir.

**Le pare-feu applique une politique implicite d autorisation.** Un equipement qui doit tout bloquer
declare explicitement sa regle finale de refus, afin que le joueur puisse la lire et la diagnostiquer
plutot que de deviner un comportement cache.

**Le calcul de chemin est structurel, la vue joueur est stochastique.** `forwardPacket` ignore la
perte de paquets et sert aux assertions ; `ping` applique la perte via le generateur deterministe.
Un objectif ne peut donc pas echouer par malchance.

**Le retour est verifie separement de l aller.** `checkReachability` teste explicitement la route de
retour, ce qui rend diagnosticable la panne classique de la passerelle manquante cote serveur.

## Rendu

`core/rendering` expose une detection de capacites reelles, des profils de qualite et un graphe de
scene. Le code metier n importe jamais de bibliotheque graphique. Le choix du moteur 3D est
documente dans `docs/adr/0002-choix-du-moteur-3d.md`.
