import type { ReactNode } from 'react';

/**
 * Systeme de composants de TSSR NEO.
 *
 * L application comptait deux cent quatorze reglages de style poses
 * directement dans le balisage, repartis sur vingt-trois fichiers, et repondait
 * a presque toute question d interface par le meme rectangle borde. Ces
 * composants nomment les intentions recurrentes une fois pour toutes.
 */

// ------------------------------------------------------------------ en-tete

interface PageHeaderProps {
  titre: string;
  /** Une phrase, pas un paragraphe : elle situe, elle n explique pas. */
  chapeau?: string;
  /** Element aligne a droite du titre : action, etat, filtre. */
  aside?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ titre, chapeau, aside, children }: PageHeaderProps): JSX.Element {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__ligne">
        <h1>{titre}</h1>
        {aside === undefined ? null : <div className="ui-page-header__aside">{aside}</div>}
      </div>
      {chapeau === undefined ? null : <p className="ui-page-header__chapeau">{chapeau}</p>}
      {children}
    </header>
  );
}

// ------------------------------------------------------------------- action

interface PrimaryActionProps {
  libelle: string;
  /** Ce qui justifie cette action ici et maintenant. */
  raison?: string;
  detail?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Une action secondaire, jamais plus d une : sinon rien ne domine. */
  secondaire?: { libelle: string; onClick: () => void };
}

/**
 * Action dominante d un ecran.
 * Un seul exemplaire par ecran : c est ce qui rend le choix evident.
 */
export function PrimaryAction({
  libelle,
  raison,
  detail,
  onClick,
  disabled = false,
  secondaire,
}: PrimaryActionProps): JSX.Element {
  return (
    <div className="ui-primary">
      {raison === undefined ? null : <p className="ui-primary__raison">{raison}</p>}
      <div className="ui-primary__ligne">
        <button
          type="button"
          className="neo-btn neo-btn--primary neo-btn--lg"
          onClick={onClick}
          disabled={disabled}
        >
          {libelle}
        </button>
        {secondaire === undefined ? null : (
          <button type="button" className="neo-btn" onClick={secondaire.onClick}>
            {secondaire.libelle}
          </button>
        )}
      </div>
      {detail === undefined ? null : <div className="ui-primary__detail">{detail}</div>}
    </div>
  );
}

// -------------------------------------------------------------- puce d etat

export type Etat = 'neutre' | 'encours' | 'acquis' | 'attention' | 'bloque';

const ETAT_LIBELLE: Record<Etat, string> = {
  neutre: '',
  encours: 'en cours',
  acquis: 'acquis',
  attention: 'a revoir',
  bloque: 'verrouille',
};

export function StatusChip({
  etat,
  libelle,
}: {
  etat: Etat;
  libelle?: string;
}): JSX.Element {
  return (
    <span className={`ui-chip ui-chip--${etat}`}>{libelle ?? ETAT_LIBELLE[etat]}</span>
  );
}

// -------------------------------------------------------------- etat vide

interface EmptyStateProps {
  titre: string;
  /** Ce que l utilisateur peut faire, pas ce qui manque au systeme. */
  explication: string;
  action?: { libelle: string; onClick: () => void };
}

/**
 * Ecran sans contenu.
 *
 * Un ecran qui annonce seulement son propre vide donne l impression d etre
 * casse. Celui-ci dit toujours ou aller ensuite.
 */
export function EmptyState({ titre, explication, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="ui-empty">
      <strong className="ui-empty__titre">{titre}</strong>
      <p className="ui-empty__texte">{explication}</p>
      {action === undefined ? null : (
        <button type="button" className="neo-btn neo-btn--primary" onClick={action.onClick}>
          {action.libelle}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ section

export function Section({
  titre,
  aside,
  children,
}: {
  titre: string;
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="ui-section">
      <div className="ui-section__tete">
        <h2>{titre}</h2>
        {aside === undefined ? null : <div>{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ tiroir

interface DrawerProps {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}

/**
 * Panneau lateral contextuel.
 *
 * Sert a consulter sans quitter : une fiche pendant un parcours, un ticket
 * pendant une intervention. La page reste visible derriere.
 */
export function Drawer({ titre, onFermer, children }: DrawerProps): JSX.Element {
  return (
    <div className="ui-drawer" role="dialog" aria-label={titre}>
      <div className="ui-drawer__tete">
        <strong>{titre}</strong>
        <button type="button" className="neo-btn neo-btn--sm neo-btn--ghost" onClick={onFermer}>
          Fermer
        </button>
      </div>
      <div className="ui-drawer__corps neo-scroll">{children}</div>
    </div>
  );
}
