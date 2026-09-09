import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { session } from './session.ts';

let sessionVersion = 0;
session.subscribe(() => {
  sessionVersion += 1;
});

/** Numero de revision de la session, incremente a chaque notification. */
export function useSessionRevision(): number {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => sessionVersion,
    () => sessionVersion,
  );
}

/** Re-rend le composant a chaque notification de la session. */
export function useSession(): typeof session {
  useSessionRevision();
  return session;
}

/**
 * Valeur derivee d un etat mute en place.
 *
 * Le monde simule est volontairement mutable : c est ce qui garantit que la 3D,
 * le terminal, les tickets et l evaluation observent strictement le meme objet.
 * L identite des objets ne change donc jamais, et React ne peut pas detecter
 * seul qu il faut recalculer. Le numero de revision joue ce role.
 *
 * On memorise dans une reference plutot qu avec `useMemo` : le calcul depend
 * d une valeur exterieure a React, ce que la memorisation standard n exprime pas.
 */
export function useSimValue<T>(revision: number, compute: () => T): T {
  const cache = useRef<{ revision: number; value: T } | undefined>(undefined);
  if (cache.current === undefined || cache.current.revision !== revision) {
    cache.current = { revision, value: compute() };
  }
  return cache.current.value;
}

export type RouteName =
  | 'accueil'
  | 'a-propos'
  | 'apprendre'
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

const KNOWN_ROUTES: RouteName[] = [
  'accueil',
  'a-propos',
  'apprendre',
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

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [name, param] = clean.split('/');
  const resolved = KNOWN_ROUTES.includes(name as RouteName) ? (name as RouteName) : 'accueil';
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
