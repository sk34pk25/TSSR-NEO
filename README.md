# TSSR NEO

Plateforme pedagogique de simulation systemes et reseaux, entierement dans le navigateur.

TSSR NEO fait tourner une infrastructure complete — reseau, systemes, services, materiel, supervision
et gestion des tickets — et laisse l apprenant la diagnostiquer et la reparer avec de vraies commandes.
Chaque objectif est verifie sur l **etat reel** de cette infrastructure, jamais sur un clic.

> Aucune certification, aucun certificat, aucune attestation officielle n est delivre.
> La progression et les badges sont purement pedagogiques.

---

## Ce qui est reellement simule

**Reseau** — arithmetique IPv4 exacte, commutation VLAN (ports d acces, trunks, VLAN natif, interfaces
virtuelles de VLAN, sous-interfaces routees), resolution ARP, routage au plus long prefixe,
pare-feu premiere-regle-gagnante, translation d adresses, DNS avec chaine CNAME et redirecteurs,
DHCP avec reservations et bascule en auto-configuration, ping et traceroute deterministes.

Un port place dans le mauvais VLAN casse reellement la connectivite, et le moteur explique **pourquoi** :
`VLAN non autorise sur le trunk`, `cable debranche`, `aucune route vers ...`, `bloque par le pare-feu`.

**Systemes** — systeme de fichiers virtuel, droits POSIX et ACL Windows avec priorite au refus explicite,
comptes et groupes, services avec dependances et mode de demarrage, journaux, processus, redemarrage
(seuls les services en demarrage automatique repartent).

**Terminal** — 35 commandes de type bash et 28 cmdlets de type PowerShell reellement interpretees,
avec tubes, redirections et elevation ponctuelle par `sudo`. Une commande non implementee est refusee
explicitement plutot que simulee.

**Console d equipement** — syntaxe proche des consoles constructeurs (`show vlan brief`,
`switchport access vlan 10`, `show ip route`), agissant sur la topologie reelle.

**Autres domaines** — gestion des services (matrice impact/urgence, delais, incidents majeurs,
changements avec refus d approbation si le plan de retour arriere manque), supervision par sondes
executees contre l etat reel, brassage physique creant et detruisant de vrais liens, sauvegarde avec
integrite verifiee et chaines incrementales, virtualisation, cloud, deploiement, administration a distance.

---

## Demarrage rapide

```bash
npm install
npm run dev
```

Puis ouvrir <http://localhost:5173>. Aucun compte n est requis.

```bash
npm run verify   # types, lint, frontieres architecturales, tests
npm run build    # construction de production
```

---

## Parcours de demonstration

1. Accueil : **Entrer dans NEO Systems**.
2. Le ticket INC-2041 signale un poste sans reseau.
3. Onglet **Console equipement**, sur `sw-lab` : `show vlan brief` revele que le port `Gi0/2`
   est reste dans le VLAN de quarantaine.
4. `configure terminal`, `interface Gi0/2`, `switchport access vlan 10`, `end`.
5. Onglet **Terminal**, machine `pc-camille` : `ipconfig /renew`, puis `ping srv-neo.neo.lan`.
6. Onglet **Tickets** : documenter la resolution et la cause racine.
7. Les six objectifs passent au vert et le debrief compare les strategies possibles.

---

## Structure du depot

```text
core/          contrats, evenements, stockage, progression, evaluation, moteur de mission, rendu
simulation/    reseau, systemes, materiel, services, supervision, sauvegarde, cloud, monde
knowledge/     base de connaissances, recherche locale, graphe, revisions
nova/          mentor pedagogique deterministe
modules/       modules de cours autonomes
apps/web/      application React
docs/          architecture, decisions, etat du projet, feuille de route
scripts/       verifications architecturales, budgets, banc d essai 3D
tests/         tests d integration et scenarios de validation
```

Les regles structurelles sont dans [`CLAUDE.md`](./CLAUDE.md).
L etat reel et la prochaine action sont dans [`docs/project-state.md`](./docs/project-state.md).

---

## Confidentialite

Aucune publicite, aucun traqueur, aucune donnee personnelle collectee. Le mode invite fonctionne sans
identite. La progression reste sur l appareil. La telemetrie technique reste locale sauf consentement
explicite. La plateforme n analyse jamais la machine reelle ni le reseau local de l utilisateur.

## Licence

MIT. Voir [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) pour les dependances tierces.
TSSR NEO n est affilie a aucun editeur ou constructeur cite a titre pedagogique.
