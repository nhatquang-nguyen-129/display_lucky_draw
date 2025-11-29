const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    loadCSV: () => ipcRenderer.invoke("loadCSV"),
    createProjectFolder: (name) => ipcRenderer.invoke("createProjectFolder", name)
});
