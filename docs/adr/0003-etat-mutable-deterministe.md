# ADR 0003 — Etat du monde mutable et deterministe

Statut : accepte
Date : 2026-09-09

## Contexte

La 3D, le terminal, l interface, les journaux, la supervision, les tickets, NOVA et l evaluation
doivent observer strictement le meme etat. Une divergence, meme breve, produirait une incoherence
visible et ruinerait la valeur pedagogique.

Par ailleurs, la sauvegarde doit permettre une reprise **exacte**, et les scenarios doivent etre
reproductibles a l identique.

## Decision

`WorldState` est un objet JSON simple, **mute en place** par les moteurs. `SimulationWorld` compose
tous les moteurs autour de cette unique instance.

Le determinisme est garanti separement :

- toute variabilite passe par `Rng`, initialise par une graine ;
- le temps est logique (`SimClock`), jamais l heure reelle ;
- `forwardPacket` est structurel et n utilise aucun hasard : c est lui qui sert aux assertions ;
- la vue joueur (`ping`) applique la perte de paquets via le generateur deterministe.

La sauvegarde est une copie profonde scellee par une empreinte d integrite verifiee au chargement.

## Consequences

Positives :

- impossible qu un panneau affiche un etat different d un autre ;
- sauvegarde et instantanes triviaux : structure JSON serialisable de bout en bout ;
- rejouabilite exacte d un scenario a partir de sa graine.

Negatives et attenuations :

- l identite des objets ne change jamais, donc React ne peut pas detecter seul qu il faut recalculer.
  Le hook `useSimValue` centralise ce point en une seule fonction documentee, plutot que de disperser
  des suppressions de regle dans l application ;
- une mutation accidentelle hors moteur serait invisible. Les mutations passent par les facades des
  moteurs, qui emettent systematiquement un evenement, et l assertion `unchanged` detecte les degats
  collateraux hors perimetre.
