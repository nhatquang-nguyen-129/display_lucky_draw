// tableEditorFile.main.js
// -----------------------------
// Xử lý các button Import / Save
// -----------------------------

import { loadCSV, saveProjectCSV } from "./tableEditorFile.api.js";

export function initTableEditorFile({ importBtn, saveBtn, currentProject, data, draftRows, selectedRows, renderTable }) {
    importBtn.addEventListener("click", async () => {
        const result = await loadCSV();
        if (result?.data?.length) {
            data.length = 0;
            result.data.forEach(row => data.push(row));
            draftRows.clear();
            selectedRows.clear();
            renderTable();
        }
    });

    saveBtn.addEventListener("click", async () => {
        if (!currentProject) return alert("Project name not specified.");
        await saveProjectCSV(currentProject, data);
        draftRows.clear();
        selectedRows.clear();
        renderTable();
        alert("Saved!");
    });
}
