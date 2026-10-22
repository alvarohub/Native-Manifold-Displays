// Shared bootstrapping/error display; the example itself is an ordinary global-mode p5 script.
import p5 from 'https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.esm.js';
import { manifoldAddon } from '../../p5-manifold/index.js';

p5.registerAddon(manifoldAddon);
const showError = message => {
  const alert = document.querySelector('[role=alert]');
  if (alert) alert.textContent = message;
  if (p5.instance) p5.instance.noLoop();
};
window.addEventListener('error', event => showError(event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason?.message ?? String(event.reason)));
