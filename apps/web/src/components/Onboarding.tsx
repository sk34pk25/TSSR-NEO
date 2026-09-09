import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo.tsx';

interface Etape {
  titre: string;
  corps: string;
  detail?: { terme: string; explication: string }[];
}

/*
 * Quatre etapes, pas une de plus.
 *
 * Elles repondent aux quatre questions qu on se pose en arrivant : qui suis-je
 * ici, qu est-ce que je vais faire vraiment, ou se trouvent les choses, et
 * comment demander de l aide sans se faire donner la reponse.
 */
const ETAPES: Etape[] = [
  {
    titre: 'Vous entrez chez NEO Systems',
    corps:
      'Vous etes technicien systemes et reseaux, en poste. Les utilisateurs signalent des pannes, vous les diagnostiquez, vous les corrigez, et vous documentez ce que vous avez fait. NOVA, votre referente technique, vous accompagne sans jamais faire le travail a votre place.',
  },
  {
    titre: 'Rien ici n est une mise en scene',
    corps:
      'L infrastructure est reellement simulee. Quand vous tapez une commande dans un terminal, elle est interpretee et elle modifie l etat du reseau. Un port laisse dans le mauvais VLAN casse vraiment la connectivite. Un objectif se valide parce que la situation est reparee, jamais parce que vous avez clique quelque part.',
  },
  {
    titre: 'Quatre endroits, et c est tout',
    corps: 'Vous ne pouvez pas vous perdre : la plateforme tient en quatre lieux.',
    detail: [
      { terme: 'Accueil', explication: 'ou vous en etes, et quoi faire maintenant.' },
      { terme: 'Apprendre', explication: 'les cours, les fiches, les revisions et vos acquis.' },
      { terme: 'Laboratoire', explication: 'manipuler librement, sans objectif impose.' },
      { terme: 'Campus', explication: 'les locaux de NEO Systems, a parcourir.' },
    ],
  },
  {
    titre: 'Demander de l aide, sans se faire souffler',
    corps:
      'NOVA commence toujours par une question qui vous remet sur la piste. Si cela ne suffit pas, vous pouvez demander un indice explicite : il vous sera donne, et il sera compte dans votre bilan d autonomie. Chercher soi-meme n est pas puni, c est simplement mesure.',
  },
];

interface OnboardingProps {
  onTerminer: () => void;
}

/**
 * Prise en main du premier passage.
 *
 * Elle n existait pas : l utilisateur etait depose devant une barre de
 * navigation sans qu une seule phrase lui dise ou il etait ni ce qu on
 * attendait de lui. Elle se voit une fois, se saute a tout moment, et se
 * retrouve depuis les reglages.
 */
export function Onboarding({ onTerminer }: OnboardingProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const dialogueRef = useRef<HTMLDivElement>(null);
  const suivantRef = useRef<HTMLButtonElement>(null);
  const etape = ETAPES[index] as Etape;
  const dernier = index === ETAPES.length - 1;

  /*
   * En se fermant, un dialogue doit rendre le focus a un endroit sense. Sans
   * cela il retourne au corps du document et la tabulation suivante repart
   * d un point imprevisible.
   */
  const terminer = useCallback(() => {
    onTerminer();
    const contenu = document.getElementById('contenu');
    contenu?.focus();
  }, [onTerminer]);

  useEffect(() => {
    suivantRef.current?.focus();
  }, [index]);

  // Le focus ne doit pas s echapper derriere une couche qui recouvre la page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        terminer();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = dialogueRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      );
      if (!focusables || focusables.length === 0) return;
      const premier = focusables[0] as HTMLElement;
      const dernierElement = focusables[focusables.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === premier) {
        event.preventDefault();
        dernierElement.focus();
      } else if (!event.shiftKey && document.activeElement === dernierElement) {
        event.preventDefault();
        premier.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [terminer]);

  return (
    <div className="onboarding" role="presentation">
      <div
        className="onboarding__dialogue"
        role="dialog"
        aria-modal="true"
        aria-label="Prise en main de TSSR NEO"
        ref={dialogueRef}
      >
        <div className="onboarding__entete">
          <Logo size={34} withWordmark={false} />
          <span className="neo-dim">
            Etape {index + 1} sur {ETAPES.length}
          </span>
        </div>

        <h2 className="onboarding__titre">
          {etape.titre}
        </h2>
        <p className="onboarding__corps">{etape.corps}</p>

        {etape.detail ? (
          <dl className="onboarding__detail">
            {etape.detail.map((ligne) => (
              <div key={ligne.terme}>
                <dt>{ligne.terme}</dt>
                <dd className="neo-muted">{ligne.explication}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="onboarding__jalons" aria-hidden="true">
          {ETAPES.map((autre, position) => (
            <span key={autre.titre} data-atteint={position <= index} />
          ))}
        </div>

        <div className="onboarding__actions">
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={terminer}>
            Passer
          </button>
          <div className="neo-row">
            {index > 0 ? (
              <button type="button" className="neo-btn" onClick={() => setIndex(index - 1)}>
                Precedent
              </button>
            ) : null}
            <button
              type="button"
              className="neo-btn neo-btn--primary"
              ref={suivantRef}
              onClick={() => (dernier ? terminer() : setIndex(index + 1))}
            >
              {dernier ? 'Commencer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
