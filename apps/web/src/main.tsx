import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './components/components.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Element racine introuvable');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Service worker : enregistre uniquement en production.
 * Un echec d enregistrement ne doit jamais empecher l application de fonctionner.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = typeof __TSSR_BASE_PATH__ === 'string' ? __TSSR_BASE_PATH__ : '/';
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((error: unknown) => {
      console.warn('Mode hors ligne indisponible :', error);
    });
  });
}
