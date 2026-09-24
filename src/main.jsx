import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  } else {
    // The SW caches cache-first, which in dev serves stale Vite modules
    // alongside fresh ones. Drop any worker and its caches left from earlier.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()));
    window.caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}
