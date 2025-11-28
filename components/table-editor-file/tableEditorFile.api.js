// tableEditorFile.api.js
// -----------------------------
// File operations: load CSV, save CSV
// -----------------------------

/**
 * Load CSV thông qua Electron
 * @returns {Promise<{data: Array}|null>}
 */
export async function loadCSV() {
    if (!window.api?.loadCSV) return null;
    return await window.api.loadCSV();
}

/**
 * Save CSV dữ liệu project
 * @param {string} projectName - tên project hiện tại
 * @param {Array} data - dữ liệu bảng
 * @returns {Promise<void>}
 */
export async function saveProjectCSV(projectName, data) {
    if (!window.api?.saveProjectData) return;

    const headers = Object.keys(data[0] || {});
    const csvContent = [
        headers.join(","),
        ...data.map(row =>
            headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(",")
        )
    ].join("\n");

    await window.api.saveProjectData(projectName, csvContent, { isCSV: true });
}
