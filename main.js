const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

// =============================
//  Create Main Window
//  - Thiết lập cửa sổ chính của ứng dụng
//  - Thêm icon app-main-icon.png
// =============================
function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, "assets/app-main-icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile("index.html");
}

app.whenReady().then(createWindow);


// =============================
//  IPC HANDLERS
//  - Các API giao tiếp giữa Renderer ↔ Main
// =============================


// ===== Load CSV =====
// Cho phép renderer mở file CSV và lấy nội dung đã parse
ipcMain.handle("loadCSV", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "CSV Files", extensions: ["csv"] }]
    });

    if (canceled || filePaths.length === 0) return { filePath: null, data: [] };

    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, "utf8");
    const records = parse(content, { columns: true, skip_empty_lines: true });

    return { filePath, data: records };
});

// IPC trả danh sách các Project Folder trong ./projects/<projectName>
ipcMain.handle("listProjects", async () => {
    const projectsDir = path.join(__dirname, "projects");

    // Nếu thư mục chưa tồn tại → tạo để tránh lỗi
    if (!fs.existsSync(projectsDir)) {
        fs.mkdirSync(projectsDir, { recursive: true });
    }

    // Lấy danh sách thư mục con (project folders)
    const items = fs.readdirSync(projectsDir, { withFileTypes: true });

    const projectNames = items
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    return projectNames;
});

// IPC tạo mới Project Folder trong ./projects/<projectName>
ipcMain.handle("createProjectFolder", async (event, projectName) => {
    const p = path.join(__dirname, "projects", projectName);
    fs.mkdirSync(p, { recursive: true });
    return { success: true, path: p };
});

// IPC xóa Project Folder trong ./projects/<projectName>
ipcMain.handle("deleteProjectFolder", async (event, projectName) => {
    const p = path.join(__dirname, "projects", projectName);

    if (!fs.existsSync(p)) {
        return { success: false, message: "Project not found" };
    }

    // ⚠️ Xóa cả folder + toàn bộ file con
    fs.rmSync(p, { recursive: true, force: true });

    return { success: true };
});
