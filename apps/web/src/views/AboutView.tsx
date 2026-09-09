/**
 * A propos.
 *
 * Ce qui occupait la moitie basse de l accueil : un expose du fonctionnement
 * reel du moteur. Il est exact et il a sa place, mais il s adresse a quelqu un
 * qui evalue la plateforme, pas a quelqu un qui vient apprendre le metier.
 */
export function AboutView(): JSX.Element {
  return (
    <div>
      <h1>Comment fonctionne TSSR NEO</h1>
      <p className="neo-muted" style={{ maxWidth: '72ch' }}>
        TSSR NEO simule une infrastructure complete dans votre navigateur : reseau, systemes,
        tickets, supervision et materiel. Chaque commande que vous tapez modifie reellement cette
        infrastructure, et chaque objectif est verifie sur son etat, jamais sur un clic.
      </p>

      <div className="card-grid" style={{ marginTop: 'var(--neo-space-5)' }}>
        <article className="course-card">
          <h2 style={{ fontSize: 'var(--neo-fs-md)' }}>
            Un reseau qui se comporte comme un reseau
          </h2>
          <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
            Commutation VLAN, ARP, routage au plus long prefixe, pare-feu, NAT, DNS et DHCP avec
            relais sont simules, ainsi que l arbre recouvrant, un routage dynamique et une
            fondation IPv6. Un port dans le mauvais VLAN casse vraiment la connectivite, et le
            diagnostic explique pourquoi.
          </p>
        </article>
        <article className="course-card">
          <h2 style={{ fontSize: 'var(--neo-fs-md)' }}>Un terminal reellement interprete</h2>
          <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
            Les commandes agissent sur l etat simule, avec droits, tubes et redirections. Une
            commande non implementee est refusee explicitement, jamais remplacee par une reponse
            fabriquee : la commande « aide » liste exactement ce qui existe.
          </p>
        </article>
        <article className="course-card">
          <h2 style={{ fontSize: 'var(--neo-fs-md)' }}>Une evaluation sur les faits</h2>
          <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
            Les objectifs sont verifies sur l etat final, la methode, la securite et la
            documentation. Plusieurs solutions valides sont acceptees, et le debrief distingue
            toujours « ca fonctionne » de « c est une bonne pratique professionnelle ».
          </p>
        </article>
        <article className="course-card">
          <h2 style={{ fontSize: 'var(--neo-fs-md)' }}>Hors ligne et sans traqueur</h2>
          <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
            Tout fonctionne localement, y compris sans connexion une fois la plateforme chargee.
            Aucune publicite, aucun suivi marketing, aucune donnee envoyee sans accord explicite.
            La simulation n accede jamais a votre machine ni a votre reseau local.
          </p>
        </article>
      </div>

      <section className="neo-card" style={{ marginTop: 'var(--neo-space-5)' }}>
        <h2 style={{ fontSize: 'var(--neo-fs-md)' }}>Ce que TSSR NEO ne fait pas</h2>
        <ul className="neo-muted" style={{ paddingLeft: 18, fontSize: 'var(--neo-fs-sm)' }}>
          <li>
            Aucune certification, aucun certificat, aucune attestation officielle. Les badges et la
            progression sont pedagogiques.
          </li>
          <li>
            Aucun acces a votre materiel reel : la plateforme ne scanne ni votre ordinateur ni
            votre reseau.
          </li>
          <li>
            Aucune synchronisation multi-appareils a ce jour : aucun service n est configure, et la
            file d attente le declare plutot que de faire semblant.
          </li>
        </ul>
      </section>
    </div>
  );
}
