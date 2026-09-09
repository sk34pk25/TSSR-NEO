import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Preparation de l environnement d interface.
 *
 * Le DOM simule ne fournit ni animation, ni contexte graphique, ni stockage
 * persistant. On comble uniquement ce qui manque, sans jamais simuler un
 * comportement metier : les tests doivent echouer si la logique est fausse.
 */

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  // Les boucles d animation ne tournent pas dans un DOM simule : on les rend
  // inertes plutot que de laisser les tests attendre indefiniment.
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), 0);
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((handle: number) =>
    window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;

  // Aucun contexte graphique : le rendu 3D bascule sur son mode degrade,
  // ce que les tests verifient explicitement.
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
