// components/table-editor-text/tableEditorText.index.js
// ------------------------------------------------------------
// Entry point tổng hợp TableEditorText module
// ------------------------------------------------------------

// 1️⃣ CSS loader
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS(new URL('./tableEditorText.style.css', import.meta.url).href);

// 2️⃣ Import các file phụ trợ (Dynamic import để tránh lỗi path)
await import(new URL('./tableEditorText.api.js', import.meta.url));
await import(new URL('./tableEditorText.state.js', import.meta.url));
await import(new URL('./tableEditorText.interface.js', import.meta.url));
await import(new URL('./tableEditorText.main.js', import.meta.url));

// 3️⃣ Export duy nhất hàm init để index.html gọi
export { initTableEditorText } from './tableEditorText.main.js';
