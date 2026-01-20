// components/data-editor/dataEditor.main.js
console.log('[DATA_EDITOR][MAIN] loaded');

import { renderDataEditorLayout, renderTable } from './dataEditor.interface.js';
import { setTableData } from './dataEditor.state.js';

export function initDataEditor(container) {
    console.log('[DATA_EDITOR] init');

    renderDataEditorLayout(container);

    const input = document.getElementById('data-file-input');

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('[DATA_EDITOR] file selected:', file.name);

        const text = await file.text();

        const { headers, rows } = parseCSV(text);

        setTableData(headers, rows);
        renderTable(headers, rows);
    });
}

/* ---------------- CSV parser đơn giản ---------------- */
function parseCSV(text) {
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim());

    const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i]?.trim() ?? '';
        });
        return obj;
    });

    return { headers, rows };
}
