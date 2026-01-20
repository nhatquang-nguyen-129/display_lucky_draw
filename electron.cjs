const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,      // ✅ CHO PHÉP fs
            contextIsolation: false     // ✅ UI dùng require
        }
    });

    win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
