import { useRef, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { Session } from "@/types";
import { fullyLocked, inputsLocked } from "@/lib/sessionLock";
import SessionLockMenu from "./SessionLockMenu";
import RestoreModal from "./RestoreModal";

export default function TabBar() {
  const { sessions, activeSessionId, switchTab, addTab, renameTab, closeTab, openFile, reorderTabs, refresh } =
    useSession();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [lockMenu, setLockMenu] = useState<{ session: Session; x: number; y: number } | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  // Ô nhập tên tab mới nghe cả onKeyDown (Enter) lẫn onBlur — 1 số trường hợp Enter cũng kéo theo blur
  // gần như cùng lúc, khiến handleAddTab() bị gọi 2 lần trước khi newName kịp reset, tạo nhầm 2 session
  // trùng tên. Chặn bằng ref (không dùng state vì cần đọc/ghi ĐỒNG BỘ trong cùng 1 tick, tránh race).
  const addingRef = useRef(false);

  function handleContextMenu(e: React.MouseEvent, s: Session) {
    e.preventDefault();
    setLockMenu({ session: s, x: e.clientX, y: e.clientY });
  }

  // --- Kéo-thả đổi thứ tự tab ---
  // dropTarget = tab đang rê qua + thả vào trước/sau nó (theo nửa trái/phải của tab).
  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id); // 1 số bản Chromium không bắt đầu kéo nếu thiếu data
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    if (!dragId) return; // không phải đang kéo tab (vd kéo file từ ngoài vào) — bỏ qua
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    if (dropTarget?.id !== overId || dropTarget.side !== side) setDropTarget({ id: overId, side });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragId && dropTarget && dragId !== dropTarget.id) {
      const ids = sessions.map((s) => s.id).filter((id) => id !== dragId);
      const at = ids.indexOf(dropTarget.id) + (dropTarget.side === "after" ? 1 : 0);
      ids.splice(at, 0, dragId);
      if (ids.some((id, i) => id !== sessions[i].id)) void reorderTabs(ids);
    }
    clearDrag();
  }

  function clearDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditValue(currentName);
  }

  const renamingRef = useRef(false);
  async function commitRename() {
    if (renamingRef.current) return; // cùng lý do với addingRef ở handleAddTab
    if (editingId && editValue.trim()) {
      renamingRef.current = true;
      try {
        await renameTab(editingId, editValue.trim());
      } finally {
        renamingRef.current = false;
      }
    }
    setEditingId(null);
  }

  // Close chỉ ẩn tab — file không đi đâu cả, mở lại bằng nút "Open" (mặc định mở ngay data/) — nên
  // không cần confirm, khác hẳn Delete (menu chuột phải, SessionLockMenu.tsx) mới thật sự đưa vào trash.
  async function handleCloseTab(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await closeTab(id);
  }

  async function handleAddTab() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    if (addingRef.current) return; // lệnh gọi thứ 2 trong cùng 1 lần submit — bỏ qua
    addingRef.current = true;
    try {
      await addTab(name);
      setNewName("");
      setAdding(false);
    } finally {
      addingRef.current = false;
    }
  }

  return (
    <div className="flex items-end gap-1 border-b border-base-800 bg-base-900 px-2 pt-2">
      <div className="flex flex-1 items-end gap-1 overflow-x-auto">
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          // Tab Full lock: không đổi tên (double-click) và không đóng (nút ×) — main.ts cũng chặn
          // sessions:rename/sessions:setClosed bằng assertSessionUnlocked. Input lock vẫn đổi tên/đóng
          // được (chỉ khoá participant/prize).
          const locked = fullyLocked(s);
          const dropSide = dropTarget?.id === s.id ? dropTarget.side : null;
          return (
            <div
              key={s.id}
              // Kéo-thả đổi thứ tự (HTML5 drag & drop, không thêm thư viện). Không kéo được lúc đang sửa
              // tên tab đó (để bôi đen chữ trong ô nhập). Tab khoá vẫn kéo được — chỉ là thứ tự hiển thị.
              draggable={editingId !== s.id}
              onDragStart={(e) => handleDragStart(e, s.id)}
              onDragOver={(e) => handleDragOver(e, s.id)}
              onDrop={handleDrop}
              onDragEnd={clearDrag}
              // Option + click (macOS) mở cùng menu Lock/Unlock như chuột phải — ngoài click 2 ngón/
              // Control-click vốn đã ra sự kiện contextmenu.
              onClick={(e) => (e.altKey ? handleContextMenu(e, s) : switchTab(s.id))}
              onDoubleClick={() => !locked && startRename(s.id, s.name)}
              onContextMenu={(e) => handleContextMenu(e, s)}
              title={
                locked
                  ? "Locked (view only) — right-click or Option + click to unlock"
                  : inputsLocked(s)
                    ? "Inputs locked (participants & prizes) — drawing and Landing still work. Right-click or Option + click to change"
                    : "Double-click to rename, drag to reorder, right-click or Option + click to lock"
              }
              className={`group relative flex max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-base-800 bg-base-950 text-base-100"
                  : "border-transparent bg-base-800/60 text-base-400 hover:bg-base-800"
              } ${dragId === s.id ? "opacity-40" : ""}`}
            >
              {/* Vạch chỉ chỗ thả: mép trái/phải của tab đang rê qua. */}
              {dropSide && (
                <span
                  className={`pointer-events-none absolute inset-y-1 w-0.5 rounded bg-teal-500 ${
                    dropSide === "before" ? "-left-[3px]" : "-right-[3px]"
                  }`}
                />
              )}
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => e.key === "Enter" && commitRename()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-28 bg-transparent text-sm text-base-100 outline-none"
                />
              ) : (
                <span className="flex items-center gap-1.5 truncate">
                  {/* Full lock: ổ khoá xám; Input lock: ổ khoá màu teal-500 — cùng hình, khác màu + tooltip. */}
                  {inputsLocked(s) && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className={`h-3.5 w-3.5 shrink-0 ${locked ? "text-base-400" : "text-teal-500"}`}
                    >
                      <title>{locked ? "Session is locked" : "Inputs are locked"}</title>
                      <rect x="5" y="11" width="14" height="9" rx="1.5" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  )}
                  <span className="truncate">{s.name}</span>
                </span>
              )}
              {!locked && (
                <button
                  onClick={(e) => handleCloseTab(e, s.id)}
                  title="Close this session"
                  className="shrink-0 rounded px-1 text-base-500 opacity-0 hover:bg-base-700 hover:text-danger-500 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {adding ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleAddTab}
            onKeyDown={(e) => e.key === "Enter" && handleAddTab()}
            placeholder="New session name..."
            className="mb-1 w-40 shrink-0 rounded-md border border-gold-500/50 bg-base-950 px-2 py-1.5 text-sm text-base-100 outline-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            title="Add new session"
            className="mb-1 flex shrink-0 h-7 w-7 items-center justify-center rounded-md text-base-400 hover:bg-base-800 hover:text-base-100"
          >
            +
          </button>
        )}
      </div>
      {/* Chọn 1 file .db bất kỳ (mặc định mở ngay data/) — mở lại session đang Close, hoặc nạp session
          từ ngoài data/ (USB, backup máy khác...). Xem openFile() trong SessionContext.tsx. */}
      <button
        onClick={() => openFile()}
        title="Open a session file — reopen a closed tab, or load one from outside data/"
        className="mb-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-base-400 hover:bg-base-800 hover:text-base-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        Open
      </button>

      {/* Session bị Delete (menu chuột phải, khác Close/nút ×) nằm ở data/.trash/, chưa xoá hẳn — xem
          RestoreModal.tsx. */}
      <button
        onClick={() => setShowRestore(true)}
        title="Restore a deleted session"
        className="mb-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-base-400 hover:bg-base-800 hover:text-base-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
        </svg>
        Restore
      </button>

      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} />}

      {lockMenu && (
        <SessionLockMenu
          session={lockMenu.session}
          x={lockMenu.x}
          y={lockMenu.y}
          onClose={() => setLockMenu(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
