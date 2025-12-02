// tableEditor.index.js
import './tableEditor.style.css';
import { initTableEditorMain } from './tableEditor.main.js';

export async function initTableEditor(container, project) {
    container.innerHTML = "<p>Loading Table Editor...</p>";
    await initTableEditorMain(container, project);
}
