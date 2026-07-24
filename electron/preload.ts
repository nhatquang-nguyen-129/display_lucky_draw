import { contextBridge, ipcRenderer } from "electron";
import type { DrawCandidate } from "./drawEngine";

const api = {
  participants: {
    list: (sessionId: string) => ipcRenderer.invoke("participants:list", sessionId),
    create: (data: {
      sessionId: string;
      name: string;
      code?: string;
      phone?: string;
      email?: string;
      extra?: Record<string, string>;
    }) => ipcRenderer.invoke("participants:create", data),
    update: (data: {
      id: string;
      name: string;
      code?: string | null;
      phone?: string | null;
      email?: string | null;
      extra?: Record<string, string>;
    }) => ipcRenderer.invoke("participants:update", data),
    bulkImport: (sessionId: string, rows: any[]) => ipcRenderer.invoke("participants:bulkImport", sessionId, rows),
    delete: (id: string) => ipcRenderer.invoke("participants:delete", id),
    bulkDelete: (ids: string[]) => ipcRenderer.invoke("participants:bulkDelete", ids),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke("participants:reorder", orderedIds),
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
    delete: (id: string) => ipcRenderer.invoke("prizes:delete", id),
  },
  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    create: (data: { name: string; allowDuplicatePrize?: boolean; excludePreviousWinners?: boolean }) =>
      ipcRenderer.invoke("sessions:create", data),
    rename: (data: { id: string; name: string }) => ipcRenderer.invoke("sessions:rename", data),
    updateOptions: (data: { id: string; allowDuplicatePrize: boolean; excludePreviousWinners: boolean }) =>
      ipcRenderer.invoke("sessions:updateOptions", data),
    updateColumnTypes: (data: { id: string; columnTypes: Record<string, string> }) =>
      ipcRenderer.invoke("sessions:updateColumnTypes", data),
    updateDuplicateColumns: (data: { id: string; duplicateColumns: string[] }) =>
      ipcRenderer.invoke("sessions:updateDuplicateColumns", data),
    updateLandingConfig: (data: { id: string; landingConfig: unknown }) =>
      ipcRenderer.invoke("sessions:updateLandingConfig", data),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
    results: (sessionId: string) => ipcRenderer.invoke("sessions:results", sessionId),
  },
  draw: {
    one: (sessionId: string) => ipcRenderer.invoke("draw:one", sessionId),
    pick: (data: { sessionId: string; excludeParticipantIds?: string[]; lockedPrizeId?: string }) =>
      ipcRenderer.invoke("draw:pick", data),
    commit: (data: { candidate: DrawCandidate; sessionId: string }) => ipcRenderer.invoke("draw:commit", data),
  },
  present: {
    open: (sessionId: string) => ipcRenderer.invoke("present:open", sessionId),
  },
  landingBuilder: {
    open: (sessionId: string) => ipcRenderer.invoke("landingBuilder:open", sessionId),
    // Cửa sổ Builder báo trạng thái "còn thay đổi chưa lưu" — cờ riêng, tách khỏi editor:dirty-changed
    // của Data Editor vì đây là 1 cửa sổ độc lập (xem main.ts, openLandingBuilderWindow).
    reportDirty: (dirty: boolean) => ipcRenderer.send("landingBuilder:dirty-changed", dirty),
  },
  dialog: {
    openAndReadFile: () => ipcRenderer.invoke("dialog:openAndReadFile"),
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
