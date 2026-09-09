import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Logo } from './Logo.tsx';
import { applyUpdate, onUpdateAvailable } from '../state/pwa.ts';
import {
  navigate,
  useHotkey,
  useRoute,
  useSession,
  useSessionRevision,
  useSimValue,
  type RouteName,
} from '../state/hooks.ts';

/*
 * Quatre concepts, et seulement quatre.
 *
 * La barre exposait six entrees dont quatre designaient un etat interne du
 * produit plutot qu un lieu : « Mission » n avait de contenu qu une fois une
 * mission lancee, « Revision » qu une fois une competence travaillee. Deux
 * destinations sur six etaient donc des impasses au premier clic. Ne restent
 * ici que des endroits ou l on peut toujours aller.
 */
const NAV: { name: RouteName; label: string; hint: string }[] = [
  { name: 'accueil', label: 'Accueil', hint: 'ou vous en etes, et la suite' },
  { name: 'apprendre', label: 'Apprendre', hint: 'cours, fiches, revisions' },
  { name: 'laboratoire', label: 'Laboratoire', hint: 'manipuler sans objectif impose' },
  { name: 'campus', label: 'Campus', hint: 'les locaux de NEO Systems' },
];

export interface CommandEntry {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** Centre de commande global, ouvert par Ctrl+K. */
function CommandCenter({
  entries,
  onClose,
}: {
  entries: CommandEntry[];
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const normalized = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (normalized === '') return entries;
    return entries.filter((entry) =>
      `${entry.label} ${entry.hint}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .includes(normalized),
    );
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  return (
    <div
      className="command-center"
      role="dialog"
      aria-modal="true"
      aria-label="Centre de commande"
      onClick={onClose}
    >
      <div className="command-center__box" onClick={(event) => event.stopPropagation()}>
        <input
          className="command-center__input"
          autoFocus
          value={query}
          placeholder="Rechercher une action, un cours, un ecran..."
          aria-label="Rechercher une action"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(filtered.length - 1, index + 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const entry = filtered[active];
              if (entry) {
                entry.run();
                onClose();
              }
            }
          }}
        />
        <ul className="command-center__list">
          {filtered.length === 0 ? (
            <li className="command-center__item neo-muted">Aucun resultat</li>
          ) : (
            filtered.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="command-center__item"
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    entry.run();
                    onClose();
                  }}
                >
                  <span>{entry.label}</span>
                  <span className="command-center__hint">{entry.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

const CONTENU_CLASSE: Record<'page' | 'large' | 'lieu', string> = {
  page: 'shell__content',
  large: 'shell__content shell__content--wide',
  lieu: 'shell__content shell__content--place',
};

interface AppShellProps {
  children: ReactNode;
  /**
   * `page` : un document lisible, largeur mesuree.
   * `large` : un plan de travail dense, toute la largeur.
   * `lieu` : un environnement, toute la surface, sans defilement de page.
   */
  variant?: 'page' | 'large' | 'lieu';
}

/**
 * Coquille applicative.
 * Elle repond en permanence a : ou suis-je, que dois-je faire, pourquoi.
 */
export function AppShell({ children, variant = 'page' }: AppShellProps): JSX.Element {
  const session = useSession();
  const route = useRoute();
  const [commandOpen, setCommandOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => onUpdateAvailable(setUpdateReady), []);

  const openCommand = useCallback(() => setCommandOpen(true), []);
  useHotkey({ key: 'k', ctrlOrMeta: true }, openCommand);

  const revision = useSessionRevision();
  /* Le libelle suit l etat reel du deroulement, jamais un drapeau d interface. */
  const missionEnCours = useSimValue(revision, () => {
    const runner = session.runner;
    const statut = runner?.state.status;
    if (!runner || (statut !== 'active' && statut !== 'briefing')) return undefined;
    const titre = runner.summary().title;
    return typeof titre === 'string' ? titre : 'Mission en cours';
  });
  const entries: CommandEntry[] = useSimValue(revision, () => {
    const items: CommandEntry[] = NAV.map((item) => ({
      id: `nav-${item.name}`,
      label: `Aller a ${item.label}`,
      hint: 'navigation',
      run: () => navigate(item.name),
    }));
    /*
     * Ce qui a quitte la barre reste atteignable en une frappe : reduire la
     * navigation visible ne doit jamais reduire ce qu on peut atteindre.
     */
    items.push(
      {
        id: 'nav-cours',
        label: 'Catalogue des cours',
        hint: 'apprendre',
        run: () => navigate('apprendre', 'cours'),
      },
      {
        id: 'nav-fiches',
        label: 'Fiches de connaissances',
        hint: 'apprendre',
        run: () => navigate('apprendre', 'fiches'),
      },
      {
        id: 'nav-reviser',
        label: 'Session de revision',
        hint: 'apprendre',
        run: () => navigate('apprendre', 'reviser'),
      },
      {
        id: 'nav-progression',
        label: 'Ma progression',
        hint: 'apprendre',
        run: () => navigate('apprendre', 'progression'),
      },
      {
        id: 'nav-reglages',
        label: 'Ouvrir les reglages',
        hint: 'navigation',
        run: () => navigate('reglages'),
      },
      {
        id: 'nav-diag',
        label: 'Ouvrir NEO Diagnostics',
        hint: 'navigation',
        run: () => navigate('diagnostics'),
      },
      {
        id: 'nav-formateur',
        label: 'Cockpit formateur',
        hint: 'navigation',
        run: () => navigate('formateur'),
      },
      {
        id: 'nav-supervision',
        label: 'Supervision',
        hint: 'navigation',
        run: () => navigate('supervision'),
      },
      { id: 'nav-tickets', label: 'Tickets', hint: 'navigation', run: () => navigate('tickets') },
    );
    for (const mission of session.missions) {
      const title = typeof mission.title === 'string' ? mission.title : mission.id;
      items.push({
        id: `mission-${mission.id}`,
        label: `Demarrer : ${title}`,
        hint: 'mission',
        run: () => {
          session.startMission(mission.id);
          navigate('mission');
        },
      });
    }
    if (session.world) {
      items.push({
        id: 'snapshot',
        label: 'Prendre un instantane de la situation',
        hint: 'session',
        run: () =>
          void session.takeSnapshot(`Instantane ${new Date().toLocaleTimeString('fr-FR')}`),
      });
    }
    return items;
  });

  return (
    <div className="shell">
      <a className="neo-skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="shell__top">
        <a
          href="#/accueil"
          aria-label="TSSR NEO, accueil"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <Logo size={30} />
        </a>
        <nav className="shell__nav neo-grow" aria-label="Navigation principale">
          {NAV.map((item) => (
            <a
              key={item.name}
              href={`#/${item.name}`}
              aria-current={route.name === item.name ? 'page' : undefined}
              title={item.hint}
            >
              {item.label}
            </a>
          ))}
          {/*
           * Une mission n est pas un lieu : elle n apparait que lorsqu elle
           * existe reellement, plutot que d occuper en permanence une place
           * dans la barre pour y annoncer qu il n y a rien.
           */}
          {missionEnCours !== undefined ? (
            <a
              className="shell__nav-live"
              href="#/mission"
              aria-current={route.name === 'mission' ? 'page' : undefined}
            >
              <span className="shell__nav-dot" aria-hidden="true" />
              {missionEnCours}
            </a>
          ) : null}
        </nav>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={openCommand}>
          Rechercher
          <kbd className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)' }}>
            Ctrl+K
          </kbd>
        </button>
        <a href="#/reglages" className="neo-btn neo-btn--ghost neo-btn--sm">
          Reglages
        </a>
      </header>
      {updateReady ? (
        <div className="update-bar" role="status">
          <span>Une nouvelle version de TSSR NEO est prete.</span>
          <button
            type="button"
            className="neo-btn neo-btn--sm neo-btn--primary"
            onClick={applyUpdate}
          >
            Recharger maintenant
          </button>
          <button
            type="button"
            className="neo-btn neo-btn--sm neo-btn--ghost"
            onClick={() => setUpdateReady(false)}
          >
            Plus tard
          </button>
        </div>
      ) : null}
      <main
        id="contenu"
        tabIndex={-1}
        className={
          variant === 'lieu' ? 'shell__main shell__main--place' : 'shell__main neo-scroll'
        }
      >
        <div className={CONTENU_CLASSE[variant]}>{children}</div>
      </main>
      {commandOpen ? (
        <CommandCenter entries={entries} onClose={() => setCommandOpen(false)} />
      ) : null}
    </div>
  );
}
