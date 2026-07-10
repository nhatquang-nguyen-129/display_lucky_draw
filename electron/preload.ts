import { contextBridge, ipcRenderer } from "electron";

const api = {
  participants: {
    list: () => ipcRenderer.invoke("participants:list"),
    create: (data: { name: string; code?: string; phone?: string; email?: string; extra?: Record<string, string> }) =>
      ipcRenderer.invoke("participants:create", data),
    update: (data: {
      id: string;
      name: string;
      code?: string | null;
      phone?: string | null;
      email?: string | null;
      extra?: Record<string, string>;
    }) => ipcRenderer.invoke("participants:update", data),
    bulkImport: (rows: any[]) => ipcRenderer.invoke("participants:bulkImport", rows),
    delete: (id: string) => ipcRenderer.invoke("participants:delete", id),
    bulkDelete: (ids: string[]) => ipcRenderer.invoke("participants:bulkDelete", ids),
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
    openAndReadFile: () => ipcRenderer.invoke("dialog:openAndReadFile"),
    },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
