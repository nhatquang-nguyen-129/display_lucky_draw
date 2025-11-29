// Entry point tổng hợp TableEditorDedup module
// - CSS loader
// - Import các file phụ trợ
// - Export init function duy nhất

import { loadComponentCSS } from '../shared/componentCSSLoader.js';
loadComponentCSS('./components/table-editor-dedup/tableEditorDedup.style.css');

import './tableEditorDedup.api.js';
import './tableEditorDedup.state.js';
import './tableEditorDedup.interface.js';
import './tableEditorDedup.main.js';

export { initTableEditorDedup } from './tableEditorDedup.main.js';
