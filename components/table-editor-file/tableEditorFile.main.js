import { parseCSV, exportCSV } from './tableEditorFile.api.js';
import { fileState, updateFileData } from './tableEditorFile.state.js';

export function initTableEditorFile(config) {
    const { container, renderTable } = config;
    const { importFileInput, importFileBtn, replaceFileBtn, saveFileBtn } = config.uiElements;

    // Import file
    importFileBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const csvText = ev.target.result;
            const data = parseCSV(csvText);
            updateFileData(data);
            renderTable();
        };
        reader.readAsText(file);
    });

    // Replace file: tương tự import nhưng giữ nguyên tên file
    replaceFileBtn.addEventListener('click', () => importFileInput.click());

    // Save file
    saveFileBtn.addEventListener('click', () => {
        const csvText = exportCSV(fileState.data);
        const blob = new Blob([csvText], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileState.currentFileName || 'export.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    });
}
