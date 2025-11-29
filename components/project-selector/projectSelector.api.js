/* components/project-selector/projectSelector.api.js
- Gọi và trả kết quả từ window.api.
*/

// 1.1. Tạo Folder mới trong Project qua Electron IPC
export async function createProjectFolder(projectName) {
    console.log(`[PROJECT SELECTOR][API] createProjectFolder called with:`, projectName);

    if (!window.api?.createProjectFolder) {
        console.warn("[PROJECT SELECTOR][API] Electron API createProjectFolder not found");
        return { success: false };
    }

    const result = await window.api.createProjectFolder(projectName);
    console.log(`[PROJECT SELECTOR][API] createProjectFolder result:`, result);
    return result;
}

// 1.2. Load CSV hoặc metadata của Project từ Project tương ứng
export async function loadProjectData(projectName) {
    console.log(`[PROJECT SELECTOR][API] loadProjectData called with:`, projectName);

    if (!window.api?.loadProjectData) {
        console.warn("[PROJECT SELECTOR][API] Electron API loadProjectData not found");
        return null;
    }

    const result = await window.api.loadProjectData(projectName);
    console.log(`[PROJECT SELECTOR][API] loadProjectData result:`, result);
    return result;
}

// 1.3. Save CSV hoặc metadata của Project vào folder.
export async function saveProjectData(projectName, csvContent) {
    console.log(`[PROJECT SELECTOR][API] saveProjectData called with:`, projectName);

    if (!window.api?.saveProjectData) {
        console.warn("[PROJECT SELECTOR][API] Electron API saveProjectData not found");
        return null;
    }

    const result = await window.api.saveProjectData(projectName, csvContent, { isCSV: true });
    console.log(`[PROJECT SELECTOR][API] saveProjectData result:`, result);
    return result;
}
