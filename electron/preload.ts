import { contextBridge, ipcRenderer } from "electron";
import type { DrawCandidate } from "./drawEngine";
import type { SyncStatus } from "./cloudSync";

const api = {
  participants: {
    list: (sessionId: string) => ipcRenderer.invoke("participants:list", sessionId),
    stats: (sessionId: string) => ipcRenderer.invoke("participants:stats", sessionId),
    create: (data: {
      sessionId: string;
      name: string;
      code?: string;
      phone?: string;
      email?: string;
      extra?: Record<string, string>;
    }) => ipcRenderer.invoke("participants:create", data),
    update: (data: {
      sessionId: string;
      id: string;
      name: string;
      code?: string | null;
      phone?: string | null;
      email?: string | null;
      extra?: Record<string, string>;
    }) => ipcRenderer.invoke("participants:update", data),
    bulkImport: (sessionId: string, rows: any[]) => ipcRenderer.invoke("participants:bulkImport", sessionId, rows),
    delete: (sessionId: string, id: string) => ipcRenderer.invoke("participants:delete", sessionId, id),
    bulkDelete: (sessionId: string, ids: string[]) => ipcRenderer.invoke("participants:bulkDelete", sessionId, ids),
    reorder: (sessionId: string, orderedIds: string[]) =>
      ipcRenderer.invoke("participants:reorder", sessionId, orderedIds),
  },
  prizes: {
    list: (sessionId: string) => ipcRenderer.invoke("prizes:list", sessionId),
    create: (data: {
      sessionId: string;
      code?: string;
      name: string;
      category?: string;
      status?: string;
      quantity: number;
      weight: number;
      allowDuplicateWithOtherPrizes?: boolean;
      allowDuplicateWithSamePrize?: boolean;
      maxWinCount?: number;
      displayImage?: string | null;
    }) => ipcRenderer.invoke("prizes:create", data),
    update: (data: {
      id: string;
      sessionId: string;
      code?: string;
      name: string;
      category?: string;
      status?: string;
      quantity: number;
      weight: number;
      allowDuplicateWithOtherPrizes?: boolean;
      allowDuplicateWithSamePrize?: boolean;
      maxWinCount?: number;
      displayImage?: string | null;
    }) => ipcRenderer.invoke("prizes:update", data),
    delete: (sessionId: string, id: string) => ipcRenderer.invoke("prizes:delete", sessionId, id),
  },
  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    listAll: () => ipcRenderer.invoke("sessions:listAll"),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    create: (data: { name: string; allowDuplicatePrize?: boolean; excludePreviousWinners?: boolean }) =>
      ipcRenderer.invoke("sessions:create", data),
    rename: (data: { id: string; name: string }) => ipcRenderer.invoke("sessions:rename", data),
    setLocked: (data: { id: string; locked: 0 | 1 | 2 }) => ipcRenderer.invoke("sessions:setLocked", data),
    updateOptions: (data: { id: string; allowDuplicatePrize: boolean; excludePreviousWinners: boolean }) =>
      ipcRenderer.invoke("sessions:updateOptions", data),
    updateColumnTypes: (data: { id: string; columnTypes: Record<string, string> }) =>
      ipcRenderer.invoke("sessions:updateColumnTypes", data),
    updateColumnLabels: (data: { id: string; columnLabels: Record<string, string> }) =>
      ipcRenderer.invoke("sessions:updateColumnLabels", data),
    updateLandingConfig: (data: { id: string; landingConfig: unknown }) =>
      ipcRenderer.invoke("sessions:updateLandingConfig", data),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
    results: (sessionId: string) => ipcRenderer.invoke("sessions:results", sessionId),
    drawHistory: (sessionId: string) => ipcRenderer.invoke("sessions:drawHistory", sessionId),
    conflicts: () => ipcRenderer.invoke("sessions:conflicts"),
    resolveConflict: (data: { sessionId: string; keepFile: string }) =>
      ipcRenderer.invoke("sessions:resolveConflict", data),
    keepBothConflict: (data: { sessionId: string; file: string }) =>
      ipcRenderer.invoke("sessions:keepBothConflict", data),
    openDataFolder: () => ipcRenderer.invoke("sessions:openDataFolder"),
    listTrash: () => ipcRenderer.invoke("sessions:listTrash"),
    restoreFromTrash: (data: { file: string }) => ipcRenderer.invoke("sessions:restoreFromTrash", data),
    permanentlyDelete: (data: { file: string }) => ipcRenderer.invoke("sessions:permanentlyDelete", data),
    setClosed: (data: { id: string; closed: boolean }) => ipcRenderer.invoke("sessions:setClosed", data),
    setTabOrder: (ids: string[]) => ipcRenderer.invoke("sessions:setTabOrder", ids),
    duplicate: (id: string) => ipcRenderer.invoke("sessions:duplicate", id),
  },
  auth: {
    // Đăng nhập account qua Cloudflare Worker — xem electron/auth.ts, electron/cloudSync.ts.
    getSession: () => ipcRenderer.invoke("auth:getSession"),
    login: (data: { username: string; password: string }) => ipcRenderer.invoke("auth:login", data),
    // Lần đầu (chưa kích hoạt): Access Code + tạo tài khoản admin, rồi đăng nhập luôn.
    verifyAccessCode: (accessCode: string) => ipcRenderer.invoke("auth:verifyAccessCode", accessCode),
    activate: (data: { accessCode: string; username: string; password: string }) => ipcRenderer.invoke("auth:activate", data),
    // Quên mật khẩu admin: Access Code + mật khẩu mới.
    resetAdminPassword: (data: { accessCode: string; password: string }) => ipcRenderer.invoke("auth:resetAdminPassword", data),
    // Cổng vào app: đã đăng nhập / cần login / không có mạng (màn "No internet connection" + Retry).
    getStartupStatus: () => ipcRenderer.invoke("auth:getStartupStatus"),
    retryStartup: () => ipcRenderer.invoke("auth:retryStartup"),
    logout: () => ipcRenderer.invoke("auth:logout"),
    importLooseFiles: (files: string[]) => ipcRenderer.invoke("auth:importLooseFiles", files),
    createAccount: (data: { username: string; password: string }) => ipcRenderer.invoke("auth:createAccount", data),
    listAccounts: () => ipcRenderer.invoke("auth:listAccounts"),
    resetAccountPassword: (data: { accountId: string; password: string }) => ipcRenderer.invoke("auth:resetAccountPassword", data),
    forceLogoutAccount: (accountId: string) => ipcRenderer.invoke("auth:forceLogoutAccount", accountId),
    setAccountDisabled: (data: { accountId: string; disabled: boolean }) =>
      ipcRenderer.invoke("auth:setAccountDisabled", data),
    // Phiên bị thu hồi thật (401 — đăng nhập nơi khác) — main tự dọn session, renderer hiện màn Login lại.
    onRevoked: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on("auth:revoked", listener);
      return () => ipcRenderer.removeListener("auth:revoked", listener);
    },
    // Mất/được lại kết nối tạm thời (mất mạng/server lỗi tạm, KHÁC bị thu hồi) — renderer hiện popup
    // "Reconnecting..." (cửa sổ chính/Builder/Data Editor — KHÔNG gửi tới Present), không đóng gì.
    onConnectivityChange: (cb: (offline: boolean) => void) => {
      const listener = (_e: unknown, offline: boolean) => cb(offline);
      ipcRenderer.on("auth:connectivity", listener);
      return () => ipcRenderer.removeListener("auth:connectivity", listener);
    },
  },
  sync: {
    // Đồng bộ theo điểm chốt — xem electron/cloudSync.ts.
    getStatuses: () => ipcRenderer.invoke("sync:getStatuses"),
    // Điểm chốt từ renderer (chuyển tab): kiểm tra + đồng bộ 1 session.
    session: (sessionId: string) => ipcRenderer.invoke("sync:session", sessionId),
    // Nút Refresh trong SessionsModal — đồng bộ toàn bộ account.
    all: () => ipcRenderer.invoke("sync:all"),
    onStatus: (cb: (data: { sessionId: string; status: SyncStatus }) => void) => {
      const listener = (_e: unknown, data: { sessionId: string; status: SyncStatus }) => cb(data);
      ipcRenderer.on("sync:status", listener);
      return () => ipcRenderer.removeListener("sync:status", listener);
    },
    // Đồng bộ vừa thêm/thay/chuyển vào Trash session (Pull, tách bản, đã xoá ở máy khác) — refresh tab.
    onSessionsChanged: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on("sync:sessionsChanged", listener);
      return () => ipcRenderer.removeListener("sync:sessionsChanged", listener);
    },
  },
  draw: {
    one: (sessionId: string) => ipcRenderer.invoke("draw:one", sessionId),
    pick: (data: { sessionId: string; excludeParticipantIds?: string[]; lockedPrizeId?: string }) =>
      ipcRenderer.invoke("draw:pick", data),
    commit: (data: { candidate: DrawCandidate; sessionId: string }) => ipcRenderer.invoke("draw:commit", data),
    resetSession: (sessionId: string) => ipcRenderer.invoke("draw:resetSession", sessionId),
  },
  present: {
    open: (sessionId: string) => ipcRenderer.invoke("present:open", sessionId),
    toggleFullscreen: () => ipcRenderer.invoke("present:toggleFullscreen") as Promise<boolean>,
    // Main process báo lại khi trạng thái fullscreen đổi (kể cả đổi bằng cách khác ngoài nút toggle,
    // vd nút xanh lá trên macOS) — trả về hàm huỷ đăng ký để component tự cleanup lúc unmount.
    onFullscreenChange: (cb: (isFullscreen: boolean) => void) => {
      const listener = (_e: unknown, value: boolean) => cb(value);
      ipcRenderer.on("present:fullscreen-changed", listener);
      return () => ipcRenderer.removeListener("present:fullscreen-changed", listener);
    },
  },
  landingBuilder: {
    open: (sessionId: string) => ipcRenderer.invoke("landingBuilder:open", sessionId),
    // Cửa sổ Builder báo trạng thái "còn thay đổi chưa lưu" — cờ riêng, tách khỏi editor:dirty-changed
    // của Data Editor vì đây là 1 cửa sổ độc lập (xem main.ts, openLandingBuilderWindow).
    reportDirty: (dirty: boolean) => ipcRenderer.send("landingBuilder:dirty-changed", dirty),
  },
  dataEditor: {
    // Mở Data Editor thành 1 cửa sổ riêng (giống landingBuilder.open) — xem main.ts's
    // openDataEditorWindow. `editor.reportDirty` bên dưới vẫn dùng để báo trạng thái chưa lưu, không
    // cần thêm hàm riêng cho namespace này.
    open: (sessionId: string) => ipcRenderer.invoke("dataEditor:open", sessionId),
  },
  dialog: {
    openAndReadFile: () => ipcRenderer.invoke("dialog:openAndReadFile"),
    saveFile: (data: { defaultName: string; ext: "csv" | "xlsx"; text?: string; base64?: string }) =>
      ipcRenderer.invoke("dialog:saveFile", data),
  },
  media: {
    // Mở dialog chọn video, main lưu vào bảng media của session — xem electron/media.ts.
    importVideo: (sessionId: string) => ipcRenderer.invoke("media:importVideo", sessionId),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  },
  editor: {
    // Data Editor báo trạng thái "còn thay đổi chưa lưu" cho main process,
    // để chặn đóng app đột ngột và hỏi xác nhận (xem main.ts, sự kiện "close").
    reportDirty: (dirty: boolean) => ipcRenderer.send("editor:dirty-changed", dirty),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
