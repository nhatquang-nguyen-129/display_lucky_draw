// Entry point tổng hợp TableEditorText module
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS('./components/table-editor-text/tableEditorText.style.css');

import './tableEditorText.api.js';
import './tableEditorText.state.js';
import './tableEditorText.interface.js';
import './tableEditorText.main.js';

export { initTableEditorText } from './tableEditorText.main.js';
