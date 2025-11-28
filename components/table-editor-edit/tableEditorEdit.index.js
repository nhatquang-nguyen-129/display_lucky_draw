// Entry point tổng hợp TableEditorEdit module
import { loadComponentCSS } from '../_shared/css-loader.js';
loadComponentCSS('./components/table-editor-edit/tableEditorEdit.style.css');

import './tableEditorEdit.api.js';
import './tableEditorEdit.state.js';
import './tableEditorEdit.interface.js';
import './tableEditorEdit.main.js';

export { initTableEditorEdit } from './tableEditorEdit.main.js';
