// components/project-selector/projectSelector.index.js
// ------------------------------------------------------------
// Entry point tổng hợp cho ProjectSelector module
// - Import các file phụ trợ
// - Export main function để renderer import duy nhất

// 1️⃣ Style riêng module
import './ProjectSelector.style.css';

// 2️⃣ Interface, API, State, Logic
import './projectSelector.interface.js';
import '../api/project.api.js';
import './projectSelector.state.js';
import './projectSelector.logic.js';

// 3️⃣ Export main function
export { initProjectSelector } from './projectSelector.main.js';
