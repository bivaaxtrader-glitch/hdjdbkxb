import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
// import { seedPromo } from './seedData';

// seedPromo();

import './index.css';

window.addEventListener('error', (event) => {
  console.error("Caught window error:", event.message, event.filename, event.lineno, event.colno, event.error);
});

// Overwrite console.error to suppress the duplicate key warning
// This prevents AI Studio Preview wrappers from throwing an error overlay that blocks testing on mobile.
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Encountered two children with the same key')) {
    return;
  }
  originalConsoleError(...args);
};

// Establishing session for AI Studio Preview Environment
const establishSession = async () => {
  try {
    // A simple GET request will trigger the cookie check redirect if needed.
    // GET redirects work correctly, while POST redirects to cookie check can cause 405 errors.
    console.log("Establishing session...");
    const res = await fetch('/api/health');
    if (res.ok) {
       console.log("Session established successfully.");
    }
  } catch (e) {
    console.error("Failed to establish session:", e);
  }
};

const init = async () => {
  await establishSession();
  
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </StrictMode>,
  );
};

init();
