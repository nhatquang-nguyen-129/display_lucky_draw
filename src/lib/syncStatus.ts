import { useEffect, useState } from "react";
import { SyncStatus } from "@/types";

// Trạng thái đồng bộ mọi session (chấm trên tab, SessionsModal) — lấy 1 lần rồi nghe sự kiện từ main
// (electron/cloudSync.ts onStatusChange). Không poll.
export function useSyncStatuses(): Record<string, SyncStatus> {
  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({});
  useEffect(() => {
    let alive = true;
    void window.api.sync.getStatuses().then((s) => alive && setStatuses((prev) => ({ ...s, ...prev })));
    const off = window.api.sync.onStatus(({ sessionId, status }) => setStatuses((prev) => ({ ...prev, [sessionId]: status })));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return statuses;
}

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: "Synced to cloud",
  dirty: "Changes not synced yet",
  syncing: "Syncing...",
  error: "Sync failed — will retry",
};
