import { useEffect, useState, useSyncExternalStore } from 'react';
import { session } from './session.ts';

/** Re-rend le composant a chaque notification de la session. */
export function useSession(): typeof session {
  useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => sessionVersion,
    () => sessionVersion,
  );
  return session;
}

let sessionVersion = 0;
session.subscribe(() => {
  sessionVersion += 1;
});

export type RouteName =
  | 'accueil'
  | 'campus'
  | 'mission'
  | 'connaissances'
  | 'laboratoire'
  | 'supervision'
  | 'tickets'
  | 'revision'
  | 'progression'
  | 'formateur'
  | 'reglages'
  | 'diagnostics';

export interface Route {
  name: RouteName;
  param: string | undefined;
}

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [name, param] = clean.split('/');
  const known: RouteName[] = [
    'accueil',
    'campus',
    'mission',
    'connaissances',
    'laboratoire',
    'supervision',
    'tickets',
    'revision',
    'progression',
    'formateur',
    'reglages',
    'diagnostics',
  ];
  const resolved = known.includes(name as RouteName) ? (name as RouteName) : 'accueil';
  return { name: resolved, param: param === '' ? undefined : param };
}

export function navigate(name: RouteName, param?: string): void {
  window.location.hash = param === undefined ? `#/${name}` : `#/${name}/${param}`;
}

/** Routage par fragment : compatible avec un hebergement statique en sous-repertoire. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Raccourci clavier global, desactive dans les champs de saisie. */
export function useHotkey(combo: { key: string; ctrlOrMeta?: boolean }, handler: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const editing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key.toLowerCase() !== combo.key.toLowerCase()) return;
      if (combo.ctrlOrMeta === true && !(event.ctrlKey || event.metaKey)) return;
      if (combo.ctrlOrMeta !== true && editing) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo.key, combo.ctrlOrMeta, handler]);
}
