// Entry point tổng hợp TableEditorText module
import { loadComponentCSS } from '../_shared/css-loader.js';
loadComponentCSS('./components/table-editor-text/tableEditorText.style.css');

import './tableEditorText.api.js';
import './tableEditorText.state.js';
import './tableEditorText.ui.js';
import './tableEditorText.main.js';

export { initTableEditorText } from './tableEditorText.main.js';
