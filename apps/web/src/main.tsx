import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './state/pwa.ts';
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

// Le service worker n est enregistre qu en production : en developpement il
// masquerait les rechargements a chaud et les erreurs reelles.
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = typeof __TSSR_BASE_PATH__ === 'string' ? __TSSR_BASE_PATH__ : '/';
    void registerServiceWorker(base);
  });
}
