/* components/project-selector/projectSelector.api.js
- Gọi và trả kết quả từ window.api.
*/

// 1. Thực hiện việc gọi window.api

// 1.1. Tạo Folder mới trong Project qua Electron IPC
export async function createProjectFolder(projectName) {
    if (!window.api?.createProjectFolder) {
        console.warn("[PROJECT SELECTOR] Electron API createProjectFolder not found");
        return { success: false };
    }
    return await window.api.createProjectFolder(projectName);
}

// 1.2. Load CSV hoặc metadata của Project từ Project tương ứng
export async function loadProjectData(projectName) {
    if (!window.api?.loadProjectData) return null;
    return await window.api.loadProjectData(projectName);
}

// 1.3. Save CSV hoặc metadata của Project vào folder.
export async function saveProjectData(projectName, csvContent) {
    if (!window.api?.saveProjectData) return null;
    return await window.api.saveProjectData(projectName, csvContent, { isCSV: true });
}
