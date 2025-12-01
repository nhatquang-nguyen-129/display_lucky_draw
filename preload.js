// preload.js
// Chạy ở context isolated (renderer không có quyền node trực tiếp).
// Mục đích: expose 1 tập các API an toàn cho renderer (window.api.*)
// Sử dụng contextBridge để tránh leak quyền node.

const { contextBridge, ipcRenderer } = require("electron");

/**
 * VALIDATORS / HELPERS
 * - Một số validation cơ bản để tránh truyền dữ liệu không hợp lệ vào IPC.
 * - Không thay thế cho validation ở main process — main vẫn phải kiểm tra kỹ.
 */
const isString = (v) => typeof v === "string" || v instanceof String;

/**
 * API được expose cho renderer:
 * - createProjectFolder(name): tạo thư mục project ở /projects/<name>
 * - listProjects(): trả về mảng tên các folder con trong /projects
 * - loadCSV(): mở dialog chọn file CSV và trả về nội dung đã parse
 *
 * IMPORTANT:
 * - Các call đều dùng ipcRenderer.invoke(...) (promise-based).
 * - Tên channel (string) phải khớp với ipcMain.handle(...) ở main.js.
 * - Main process phải thực hiện kiểm tra/validate đầu vào, xử lý IO.
 */
contextBridge.exposeInMainWorld("api", {
  /**
   * Tạo project folder mới.
   * @param {string} name - tên folder muốn tạo (ví dụ: "project-01")
   * @returns {Promise<object>} - phụ thuộc handler ở main, thường { success: true, path: "..." }
   *
   * Security notes:
   * - Chỉ gửi string, tránh object phức tạp.
   * - Main process phải sanitize (loại bỏ ../, ký tự không hợp lệ).
   */
  createProjectFolder: async (name) => {
    if (!isString(name) || name.trim() === "") {
      // Trả về promise reject để renderer dễ bắt lỗi
      return Promise.reject(new Error("createProjectFolder: 'name' must be a non-empty string"));
    }
    // Trim để tránh space thừa
    const safeName = name.trim();
    return ipcRenderer.invoke("createProjectFolder", safeName);
  },

  /**
   * Lấy danh sách project (tên các folder) trong thư mục cấp 1 `projects/`.
   * @returns {Promise<string[]>} - mảng tên folder (ví dụ: ["projA", "projB"])
   *
   * NOTE: Bạn phải thêm handler `ipcMain.handle("listProjects", ...)` ở main.js.
   */
  listProjects: async () => {
    return ipcRenderer.invoke("listProjects");
  },

  /**
   * Mở dialog chọn CSV và parse nội dung (main.js đã có handler `loadCSV`).
   * @returns {Promise<{filePath: string|null, data: Array<object>}>}
   * - filePath: chuỗi đường dẫn file hoặc null nếu cancel
   * - data: mảng bản ghi (columns: true khi parse)
   */
  loadCSV: async () => {
    return ipcRenderer.invoke("loadCSV");
  },

  /**
   * Một helper nhỏ nếu renderer cần mở external link (không bắt buộc).
   * - Nếu dùng, hãy tạo handler tương ứng ở main: ipcMain.handle("openExternal", ...)
   */
  openExternal: async (url) => {
    if (!isString(url) || url.trim() === "") {
      return Promise.reject(new Error("openExternal: 'url' must be a non-empty string"));
    }
    return ipcRenderer.invoke("openExternal", url.trim());
  }
});

/**
 * Optional: nếu bạn muốn lắng nghe event push từ main -> renderer,
 * có thể expose 1 API subscribe/once. Ví dụ:
 *
 * window.api.on('projectCreated', handler)
 *
 * Nhưng lưu ý: việc expose trực tiếp event emitter sẽ tăng bề mặt tấn công.
 * Nếu cần, hãy implement 1 wrapper nhỏ ở đây.
 */

// Example (commented): expose một hàm đăng ký lắng nghe
// contextBridge.exposeInMainWorld("events", {
//   onProjectCreated: (callback) => {
//     // callback sẽ được gọi khi main gửi 'project-created' với payload
//     ipcRenderer.on("project-created", (ev, payload) => callback(payload));
//   },
//   removeOnProjectCreated: () => {
//     ipcRenderer.removeAllListeners("project-created");
//   }
// });

/**
 * Tóm tắt:
 * - Exposed API: window.api.createProjectFolder, .listProjects, .loadCSV, .openExternal
 * - Main process cần cài các ipcMain.handle tương ứng.
 * - Luôn validate ở main process trước khi thao tác filesystem / network.
 */
