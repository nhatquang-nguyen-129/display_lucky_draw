// components/table-editor-dedup/tableEditorDedup.index.js
// ------------------------------------------------------------
// Entry point tổng hợp TableEditorDedup module
// ------------------------------------------------------------

// 1️⃣ CSS loader
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS(new URL('./tableEditorDedup.style.css', import.meta.url).href);

// 2️⃣ Import các file con (dynamic import + URL)
await import(new URL('./tableEditorDedup.api.js', import.meta.url));
await import(new URL('./tableEditorDedup.interface.js', import.meta.url));
await import(new URL('./tableEditorDedup.state.js', import.meta.url));
await import(new URL('./tableEditorDedup.main.js', import.meta.url));

// 3️⃣ Export hàm init
export { initTableEditorDedup } from './tableEditorDedup.main.js';
