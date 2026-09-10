import { Logo } from './Logo.tsx';

/**
 * Ecran affiche sur telephone et tablette.
 *
 * TSSR NEO demande un clavier et une souris : le campus se parcourt en Z Q S D,
 * les terminaux se tapent, et les baies s inspectent au pointeur. Plutot que de
 * livrer une version degradee qui donnerait une fausse idee du produit, on le
 * dit franchement et l on n engage aucun telechargement lourd.
 *
 * Le blocage est deliberement limite a l affichage : rien dans l architecture
 * n empeche de retablir ces plateformes plus tard.
 */
export function AppareilRequis(): JSX.Element {
  return (
    <div className="appareil-requis">
      <div className="appareil-requis__carte">
        <Logo size={44} withWordmark={false} />
        <h1>TSSR NEO necessite actuellement un ordinateur</h1>
        <p>
          Pour profiter des laboratoires, du campus 3D et des outils techniques, ouvrez cette
          plateforme sur un PC ou un Mac equipe d un clavier et d une souris.
        </p>
        <p className="appareil-requis__detail">
          Le campus se parcourt au clavier, les terminaux se tapent, et l inspection du materiel
          demande un pointeur. Une version tactile viendra, mais elle ne sera pas une simple
          reduction de celle-ci.
        </p>
      </div>
    </div>
  );
}

/**
 * L appareil est-il un ordinateur ?
 *
 * On interroge les capacites reelles plutot que la chaine d agent utilisateur :
 * un pointeur fin et le survol sont exactement ce dont la plateforme a besoin,
 * et ce sont eux qui manquent sur un ecran tactile. La largeur seule ne suffit
 * pas, une fenetre etroite sur un ordinateur restant un ordinateur.
 */
export function estUnOrdinateur(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  const pointeurFin = window.matchMedia('(pointer: fine)').matches;
  const survolPossible = window.matchMedia('(hover: hover)').matches;
  if (pointeurFin && survolPossible) return true;
  // Un appareil hybride avec clavier reste acceptable s il a un vrai pointeur.
  return pointeurFin && window.innerWidth >= 1024;
}
