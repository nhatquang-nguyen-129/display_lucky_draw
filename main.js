const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const CSVLoader = require("./modules/CSVLoader");
const csvLoader = new CSVLoader();

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js")
        }
    });

    win.loadFile("index.html");
}

app.whenReady().then(createWindow);

ipcMain.handle("open-csv-dialog", async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("load-csv", async () => {
    const filePath = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    }).then(r => r.canceled ? null : r.filePaths[0]);

    if (!filePath) return null;

    const result = await csvLoader.loadCSV(() => filePath);
    return result;
});
