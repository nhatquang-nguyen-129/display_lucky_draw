const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile("index.html");
}

app.whenReady().then(createWindow);

// ===== IPC =====
// Load CSV
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

// Create project folder
ipcMain.handle("createProjectFolder", async (event, projectName) => {
    const p = path.join(__dirname, "projects", projectName);
    fs.mkdirSync(p, { recursive: true });
    return { success: true, path: p };
});
