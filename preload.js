// preload.js
// Context isolated: renderer không có quyền node trực tiếp
// Expose API an toàn cho renderer thông qua window.api

const { contextBridge, ipcRenderer } = require("electron");

// ===== Helpers =====
const isString = (v) => typeof v === "string" || v instanceof String;

// ===== Exposed API =====
contextBridge.exposeInMainWorld("api", {

  /**
   * Tạo project folder mới
   * @param {string} name - tên folder
   * @returns {Promise<object>} - { success, path }
   */
  createProjectFolder: async (name) => {
    if (!isString(name) || !name.trim()) {
      return Promise.reject(new Error("createProjectFolder: 'name' must be a non-empty string"));
    }
    return ipcRenderer.invoke("createProjectFolder", name.trim());
  },

  /**
   * Lấy danh sách project trong folder /projects
   * @returns {Promise<string[]>} - mảng tên folder
   */
  listProjects: async () => ipcRenderer.invoke("listProjects"),

  /**
   * Xóa project folder (cả folder + nội dung)
   * @param {string} name - tên folder cần xóa
   * @returns {Promise<object>} - { success: boolean, message?: string }
   */
  deleteProjectFolder: async (name) => {
    if (!isString(name) || !name.trim()) {
      return Promise.reject(new Error("deleteProjectFolder: 'name' must be a non-empty string"));
    }
    return ipcRenderer.invoke("deleteProjectFolder", name.trim());
  },

  /**
   * Mở dialog chọn CSV và parse nội dung
   * @returns {Promise<{filePath: string|null, data: Array<object>}>}
   */
  loadCSV: async () => ipcRenderer.invoke("loadCSV"),

  /**
   * Mở external link (cần handler ở main)
   * @param {string} url 
   */
  openExternal: async (url) => {
    if (!isString(url) || !url.trim()) {
      return Promise.reject(new Error("openExternal: 'url' must be a non-empty string"));
    }
    return ipcRenderer.invoke("openExternal", url.trim());
  }

});

// ===== Optional event listener wrapper =====
// window.events.onProjectCreated(callback)
// window.events.removeOnProjectCreated()
/*
contextBridge.exposeInMainWorld("events", {
  onProjectCreated: (cb) => ipcRenderer.on("project-created", (e, payload) => cb(payload)),
  removeOnProjectCreated: () => ipcRenderer.removeAllListeners("project-created")
});
*/

// Tóm tắt:
// - window.api.createProjectFolder / listProjects / deleteProjectFolder / loadCSV / openExternal
// - Main process vẫn phải validate input trước khi thao tác filesystem hoặc network
