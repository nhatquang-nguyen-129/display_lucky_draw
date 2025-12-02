// components/table-editor-edit/tableEditorEdit.index.js
// ------------------------------------------------------------
// Entry point tổng hợp TableEditorEdit module
// ------------------------------------------------------------

// 1️⃣ CSS loader
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS(new URL('./tableEditorFile.style.css', import.meta.url).href);

// 2️⃣ Import các file con (dynamic import + URL)
await import(new URL('./tableEditorEdit.api.js', import.meta.url));
await import(new URL('./tableEditorEdit.state.js', import.meta.url));
await import(new URL('./tableEditorEdit.interface.js', import.meta.url));
await import(new URL('./tableEditorEdit.main.js', import.meta.url));

// 3️⃣ Export hàm init
export { initTableEditorEdit } from './tableEditorEdit.main.js';
