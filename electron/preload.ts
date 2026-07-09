import { contextBridge, ipcRenderer } from "electron";

const api = {
  participants: {
    list: () => ipcRenderer.invoke("participants:list"),
    create: (data: { name: string; code?: string; phone?: string; email?: string }) =>
      ipcRenderer.invoke("participants:create", data),
    bulkImport: (rows: any[]) => ipcRenderer.invoke("participants:bulkImport", rows),
    delete: (id: string) => ipcRenderer.invoke("participants:delete", id),
  },
  prizes: {
    list: () => ipcRenderer.invoke("prizes:list"),
    create: (data: { name: string; quantity: number; weight: number }) =>
      ipcRenderer.invoke("prizes:create", data),
    delete: (id: string) => ipcRenderer.invoke("prizes:delete", id),
  },
  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    create: (data: {
      name: string;
      prizeIds: string[];
      allowDuplicatePrize: boolean;
      excludePreviousWinners: boolean;
    }) => ipcRenderer.invoke("sessions:create", data),
    results: (sessionId: string) => ipcRenderer.invoke("sessions:results", sessionId),
  },
  draw: {
    one: (sessionId: string) => ipcRenderer.invoke("draw:one", sessionId),
  },
  present: {
    open: (sessionId: string) => ipcRenderer.invoke("present:open", sessionId),
  },
  dialog: {
    openFile: () => ipcRenderer.invoke("dialog:openFile"),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
