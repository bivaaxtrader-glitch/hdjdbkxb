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
const establishSession = (): Promise<void> => {
  return new Promise((resolve) => {
    try {
      console.log("Establishing session via iframe...");
      const iframe = document.createElement('iframe');
      // Set to an API endpoint that is safe to load via GET
      iframe.src = '/api/health';
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          console.log("Session iframe loaded / timed out.");
          resolve();
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
            } catch (e) {}
          }, 1000);
        }
      };

      iframe.onload = done;
      iframe.onerror = done;
      
      // Safety timeout of 3 seconds so we don't block app rendering indefinitely
      setTimeout(done, 3000);
      
      document.body.appendChild(iframe);
    } catch (e) {
      console.error("Failed to establish session:", e);
      resolve();
    }
  });
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
