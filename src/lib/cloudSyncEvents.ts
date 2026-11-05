// Báo cho CloudSyncModal (nếu đang mở) biết 1 conflict vừa resolve xong ở nơi khác
// (SessionConflictDialog) — để tự load lại status() thay vì chờ người dùng bấm Refresh. Thuần
// renderer, không qua IPC vì 2 phía luôn cùng 1 process (mount độc lập qua Layout.tsx, xem
// docs/architecture/cloud-sync.md).
const listeners = new Set<() => void>();

export function notifyConflictResolved() {
  listeners.forEach((cb) => cb());
}

export function onConflictResolved(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
