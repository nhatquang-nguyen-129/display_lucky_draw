// projectSelector.index.js

// ===============================
// 0️⃣ CSS loader
// ===============================
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
console.log("[PROJECT SELECTOR][INDEX] Loading CSS...");

// Sử dụng new URL() để ES module tính đúng đường dẫn tuyệt đối
loadComponentCSS(new URL('./projectSelector.style.css', import.meta.url));
console.log("[PROJECT SELECTOR][INDEX] CSS loaded");

// ===============================
// 1️⃣ Import các module con
// ===============================
console.log("[PROJECT SELECTOR][INDEX] Importing modules...");

// Relative path từ chính file này, dùng new URL() cho chắc
await import(new URL('./projectSelector.api.js', import.meta.url));
await import(new URL('./projectSelector.interface.js', import.meta.url));
await import(new URL('./projectSelector.state.js', import.meta.url));
await import(new URL('./projectSelector.main.js', import.meta.url));

console.log("[PROJECT SELECTOR][INDEX] Modules imported successfully");

// ===============================
// 2️⃣ Export main function
// ===============================
export { initProjectSelector } from './projectSelector.main.js';
console.log("[PROJECT SELECTOR][INDEX] initProjectSelector exported");
