import { loadComponentCSS } from '../../shared/componentCSSLoader.js';

// Load CSS
loadComponentCSS(new URL('./projectSelector.style.css', import.meta.url).pathname);

// Load internal modules
await import(new URL('./projectSelector.api.js', import.meta.url));
await import(new URL('./projectSelector.state.js', import.meta.url));
await import(new URL('./projectSelector.interface.js', import.meta.url));
await import(new URL('./projectSelector.main.js', import.meta.url));

// Export ONLY init
export { initProjectSelector } from './projectSelector.main.js';
