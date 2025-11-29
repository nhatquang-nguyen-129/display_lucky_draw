const { contextBridge, ipcRenderer } = require("electron");

// Các API hiện tại
contextBridge.exposeInMainWorld("api", {
    loadCSV: () => ipcRenderer.invoke("loadCSV"),
    createProjectFolder: (name) => ipcRenderer.invoke("createProjectFolder", name),
    saveProjectData: (projectName, data) => ipcRenderer.invoke("saveProjectData", projectName, data)
});

// Override console để gửi log về main process
['log','warn','error'].forEach(level => {
    const original = console[level];
    console[level] = (...args) => {
        // Gửi lên main process
        ipcRenderer.send('renderer-log', { level, args });
        // Vẫn hiển thị trong DevTools
        original(...args);
    };
});
