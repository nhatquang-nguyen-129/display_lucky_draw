// components/table-editor-file/tableEditorFile.index.js
// ------------------------------------------------------------
// Entry point tổng hợp TableEditorFile module
// ------------------------------------------------------------

// 1️⃣ CSS loader
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS(new URL('./tableEditorFile.style.css', import.meta.url).href);

// 2️⃣ Import các file con (dynamic import + URL)
await import(new URL('./tableEditorFile.api.js', import.meta.url));
await import(new URL('./tableEditorFile.state.js', import.meta.url));
await import(new URL('./tableEditorFile.interface.js', import.meta.url));
await import(new URL('./tableEditorFile.main.js', import.meta.url));

// 3️⃣ Export hàm init
export { initTableEditorFile } from './tableEditorFile.main.js';
