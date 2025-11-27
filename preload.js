const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    loadCSV: () => ipcRenderer.invoke("loadCSV")
});
