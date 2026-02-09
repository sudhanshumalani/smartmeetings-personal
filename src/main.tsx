import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker via vite-plugin-pwa (registerType: 'prompt')
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      // When a new SW is installed and waiting, dispatch update event
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            window.dispatchEvent(
              new CustomEvent('sw-update', {
                detail: { type: 'UPDATE_FOUND' },
              }),
            );
          }
        });
      });
    } catch {
      // Service worker registration failed — app still works
    }
  });
}
