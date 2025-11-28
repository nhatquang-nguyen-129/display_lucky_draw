const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

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

// ================= CSV Handler =================
ipcMain.handle("loadCSV", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "CSV Files", extensions: ["csv"] }]
    });

    if (canceled || filePaths.length === 0) {
        return { filePath: null, data: [] };
    }

    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, "utf8");

    const records = parse(content, {
        columns: true,
        skip_empty_lines: true
    });

    return {
        filePath,
        data: records
    };
});

// ================= Project Folder Handler =================
ipcMain.handle("createProjectFolder", async (event, projectName) => {
    try {
        const projectsDir = path.join(__dirname, "projects"); // folder cấp 1
        if (!fs.existsSync(projectsDir)) {
            fs.mkdirSync(projectsDir);
        }

        const projectFolder = path.join(projectsDir, projectName);
        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder);
            console.log("Project folder created:", projectFolder);
        } else {
            console.warn("Folder already exists:", projectFolder);
        }

        return { success: true, path: projectFolder };
    } catch (err) {
        console.error("Failed to create project folder:", err);
        return { success: false, error: err.message };
    }
});

// ================= Save Project Data Handler =================
ipcMain.handle("saveProjectData", async (event, projectName, data, options = {}) => {
    try {
        const projectsDir = path.join(__dirname, "projects");
        const projectFolder = path.join(projectsDir, projectName);

        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder, { recursive: true });
        }

        // Lưu CSV hoặc JSON
        let filePath;
        if (options.isCSV) {
            filePath = path.join(projectFolder, "data.csv");
            fs.writeFileSync(filePath, data, "utf8");
        } else {
            filePath = path.join(projectFolder, "data.json");
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        }

        console.log(`Project data saved: ${filePath}`);
        return { success: true, path: filePath };
    } catch (err) {
        console.error("Failed to save project data:", err);
        return { success: false, error: err.message };
    }
});

