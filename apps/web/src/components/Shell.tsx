import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Logo } from './Logo.tsx';
import {
  navigate,
  useHotkey,
  useRoute,
  useSession,
  useSessionRevision,
  useSimValue,
  type RouteName,
} from '../state/hooks.ts';

const NAV: { name: RouteName; label: string }[] = [
  { name: 'campus', label: 'Campus' },
  { name: 'mission', label: 'Mission' },
  { name: 'laboratoire', label: 'Laboratoire' },
  { name: 'connaissances', label: 'Connaissances' },
  { name: 'revision', label: 'Revision' },
  { name: 'progression', label: 'Progression' },
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

interface AppShellProps {
  children: ReactNode;
  wide?: boolean;
}

/**
 * Coquille applicative.
 * Elle repond en permanence a : ou suis-je, que dois-je faire, pourquoi.
 */
export function AppShell({ children, wide = false }: AppShellProps): JSX.Element {
  const session = useSession();
  const route = useRoute();
  const [commandOpen, setCommandOpen] = useState(false);

  const openCommand = useCallback(() => setCommandOpen(true), []);
  useHotkey({ key: 'k', ctrlOrMeta: true }, openCommand);

  const revision = useSessionRevision();
  const entries: CommandEntry[] = useSimValue(revision, () => {
    const items: CommandEntry[] = NAV.map((item) => ({
      id: `nav-${item.name}`,
      label: `Aller a ${item.label}`,
      hint: 'navigation',
      run: () => navigate(item.name),
    }));
    items.push(
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
            >
              {item.label}
            </a>
          ))}
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
      <main id="contenu" className="shell__main neo-scroll">
        <div className={wide ? 'shell__content shell__content--wide' : 'shell__content'}>
          {children}
        </div>
      </main>
      {commandOpen ? (
        <CommandCenter entries={entries} onClose={() => setCommandOpen(false)} />
      ) : null}
    </div>
  );
}
