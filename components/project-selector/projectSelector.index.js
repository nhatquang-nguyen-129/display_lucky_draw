// components/project-selector/projectSelector.index.js
// ------------------------------------------------------------
// Entry point tổng hợp cho ProjectSelector module
// - Import các file phụ trợ
// - Export main function để renderer import duy nhất

// 0️⃣ CSS loader
import { loadComponentCSS } from '../_shared/css-loader.js';
loadComponentCSS('./components/project-selector/projectSelector.style.css');

// 1️⃣ Interface, API, State, Logic
import '../api/project.api.js';
import './projectSelector.interface.js';
import './projectSelector.state.js';
import './projectSelector.main.js';

// 2️⃣ Export main function
export { initProjectSelector } from './projectSelector.main.js';
