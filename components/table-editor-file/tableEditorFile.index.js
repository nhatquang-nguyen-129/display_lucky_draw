// Entry point tổng hợp TableEditorFile module
import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS('./components/table-editor-file/tableEditorFile.style.css');

import './tableEditorFile.api.js';
import './tableEditorFile.state.js';
import './tableEditorFile.main.js';
import './tableEditorFile.main.js';

export { initTableEditorFile } from './tableEditorFile.main.js';
