import { CourseCatalog } from '../components/CourseCatalog.tsx';
import { KnowledgeView } from './KnowledgeView.tsx';
import { ProgressionView } from './ProgressionView.tsx';
import { ReviewView } from './ReviewView.tsx';
import { navigate, useRoute } from '../state/hooks.ts';

type Onglet = 'cours' | 'fiches' | 'reviser' | 'progression';

const ONGLETS: { id: Onglet; label: string; sous_titre: string }[] = [
  { id: 'cours', label: 'Cours', sous_titre: 'les parcours a suivre' },
  { id: 'fiches', label: 'Fiches', sous_titre: 'la documentation de reference' },
  { id: 'reviser', label: 'Reviser', sous_titre: 'ancrer ce qui a ete travaille' },
  { id: 'progression', label: 'Progression', sous_titre: 'ce qui est acquis' },
];

function estOnglet(valeur: string | undefined): valeur is Onglet {
  return ONGLETS.some((onglet) => onglet.id === valeur);
}

/**
 * Espace d apprentissage.
 *
 * Quatre activites qui repondaient chacune a une entree de navigation distincte
 * sont regroupees ici : apprendre, se documenter, reviser et mesurer sont un
 * seul geste vu de l apprenant. Les separer obligeait a comprendre le decoupage
 * interne du produit avant de pouvoir s en servir.
 */
export function LearnView(): JSX.Element {
  const route = useRoute();
  const actif: Onglet = estOnglet(route.param) ? route.param : 'cours';

  return (
    <div>
      <h1>Apprendre</h1>
      <p className="neo-muted" style={{ maxWidth: '70ch' }}>
        Tout ce qui concerne le savoir se trouve ici : les cours a suivre, les fiches a consulter,
        les revisions a faire et le releve de ce qui est acquis.
      </p>

      <div
        className="tabs tabs--section"
        role="tablist"
        aria-label="Sections de l espace d apprentissage"
        style={{ marginTop: 'var(--neo-space-5)' }}
      >
        {ONGLETS.map((onglet) => (
          <button
            key={onglet.id}
            type="button"
            role="tab"
            aria-selected={actif === onglet.id}
            onClick={() => navigate('apprendre', onglet.id)}
          >
            {onglet.label}
          </button>
        ))}
      </div>
      <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)', marginTop: 6 }}>
        {ONGLETS.find((onglet) => onglet.id === actif)?.sous_titre}
      </p>

      <section style={{ marginTop: 'var(--neo-space-5)' }}>
        {actif === 'cours' ? <CourseCatalog /> : null}
        {actif === 'fiches' ? <KnowledgeView embedded /> : null}
        {actif === 'reviser' ? <ReviewView embedded /> : null}
        {actif === 'progression' ? <ProgressionView embedded /> : null}
      </section>
    </div>
  );
}
