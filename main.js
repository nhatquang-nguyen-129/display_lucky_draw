// ===========================
// main.js - Electron Main Process
// ===========================

// ----------------- Loading -----------------
console.log("[MAIN] main.js is loading...");

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

console.log("[MAIN] Electron modules loaded successfully");

// ---------------- Window ----------------
function createWindow() {
    console.log("[MAIN] Creating BrowserWindow...");

    let win;
    try {
        win = new BrowserWindow({
            width: 1200,
            height: 800,
            icon: path.join(__dirname, "assets/app-main-icon.png"),
            webPreferences: {
                preload: path.join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        console.log("[MAIN] BrowserWindow instance created successfully");
    } catch (err) {
        console.error("[MAIN] Failed to create BrowserWindow:", err);
        return;
    }

    win.loadFile("index.html")
        .then(() => console.log("[MAIN] index.html loaded successfully"))
        .catch(err => console.error("[MAIN] Failed to load index.html:", err));
}

// ---------------- App Ready ----------------
app.whenReady().then(() => {
    console.log("[MAIN] App is ready");
    createWindow();
});

// ================= CSV Handler =================
ipcMain.handle("loadCSV", async () => {
    console.log("[MAIN] loadCSV IPC triggered");

    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "CSV Files", extensions: ["csv"] }]
        });

        if (canceled || filePaths.length === 0) {
            console.log("[MAIN] CSV load canceled or no file selected");
            return { filePath: null, data: [] };
        }

        const filePath = filePaths[0];
        console.log("[MAIN] CSV file selected:", filePath);

        const content = fs.readFileSync(filePath, "utf8");
        console.log("[MAIN] CSV file read successfully, length:", content.length);

        const records = parse(content, {
            columns: true,
            skip_empty_lines: true
        });

        console.log("[MAIN] CSV parsed successfully, records count:", records.length);
        return { filePath, data: records };
    } catch (err) {
        console.error("[MAIN] Failed to load CSV:", err);
        return { filePath: null, data: [], error: err.message };
    }
});

// ================= Project Folder Handler =================
ipcMain.handle("createProjectFolder", async (event, projectName) => {
    console.log("[MAIN] createProjectFolder IPC triggered for project:", projectName);

    try {
        const projectsDir = path.join(__dirname, "projects");

        if (!fs.existsSync(projectsDir)) {
            fs.mkdirSync(projectsDir);
            console.log("[MAIN] Projects root folder created:", projectsDir);
        }

        const projectFolder = path.join(projectsDir, projectName);
        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder);
            console.log("[MAIN] Project folder created successfully:", projectFolder);
        } else {
            console.warn("[MAIN] Project folder already exists:", projectFolder);
        }

        return { success: true, path: projectFolder };
    } catch (err) {
        console.error("[MAIN] Failed to create project folder:", err);
        return { success: false, error: err.message };
    }
});

// ================= Save Project Data Handler =================
ipcMain.handle("saveProjectData", async (event, projectName, data, options = {}) => {
    console.log("[MAIN] saveProjectData IPC triggered for project:", projectName, "options:", options);

    try {
        const projectsDir = path.join(__dirname, "projects");
        const projectFolder = path.join(projectsDir, projectName);

        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder, { recursive: true });
            console.log("[MAIN] Project folder created recursively:", projectFolder);
        }

        let filePath;
        if (options.isCSV) {
            filePath = path.join(projectFolder, "data.csv");
            fs.writeFileSync(filePath, data, "utf8");
            console.log("[MAIN] CSV data saved successfully at:", filePath);
        } else {
            filePath = path.join(projectFolder, "data.json");
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
            console.log("[MAIN] JSON data saved successfully at:", filePath);
        }

        return { success: true, path: filePath };
    } catch (err) {
        console.error("[MAIN] Failed to save project data:", err);
        return { success: false, error: err.message };
    }
});

// ================= Renderer Log Forwarding =================
ipcMain.on('renderer-log', (event, { level, args }) => {
    if (level === 'log') console.log('[RENDERER]', ...args);
    if (level === 'warn') console.warn('[RENDERER]', ...args);
    if (level === 'error') console.error('[RENDERER]', ...args);
});

// ----------------- End of main.js -----------------
console.log("[MAIN] main.js loaded successfully");
