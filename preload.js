const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    openCSVDialog: () => ipcRenderer.invoke("open-csv-dialog"),
    loadCSV: () => ipcRenderer.invoke("load-csv")
});
