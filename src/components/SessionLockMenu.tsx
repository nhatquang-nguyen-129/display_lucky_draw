import { useEffect, useRef, useState } from "react";
import { Session } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import HoldToUnlockButton from "./HoldToUnlockButton";

interface Props {
  session: Session;
  x: number;
  y: number;
  onClose: () => void;
  onChanged: () => void; // gọi lại sessions:list ở TabBar sau khi đổi trạng thái khoá
}

// Menu chuột phải (Windows) / secondary-click trên trackpad (macOS — browser tự chuẩn hoá qua sự
// kiện contextmenu, không cần code riêng theo hệ điều hành) trên 1 tab session: Lock/Unlock tuỳ
// trạng thái hiện tại (không phải bảo mật, không password — chỉ tránh nhầm lẫn chỉnh sửa sau khi đã
// quay xong, xem docs/architecture Session Lock), và Move to trash (chuyển vào data/.trash/, KHÁC
// Close/nút × ở TabBar.tsx — Close chỉ ẩn tab, không đụng file). Khôi phục hoặc xoá vĩnh viễn khỏi
// trash: nút "Restore" ở TabBar.tsx, mở RestoreModal.tsx.
export default function SessionLockMenu({ session, x, y, onClose, onChanged }: Props) {
  const { deleteTab } = useSession();
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmingUnlock) return; // modal Unlock tự xử lý đóng riêng
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [confirmingUnlock, onClose]);

  async function handleLock() {
    const result = await window.api.sessions.setLocked({ id: session.id, locked: true });
    onClose();
    if (!result.ok) {
      alert(`Close the ${result.openWindows.join(", ")} window of session "${session.name}" before locking it.`);
      return;
    }
    onChanged();
  }

  async function handleConfirmUnlock() {
    await window.api.sessions.setLocked({ id: session.id, locked: false });
    onChanged();
    setConfirmingUnlock(false);
    onClose();
  }

  async function handleMoveToTrash() {
    onClose();
    const ok = confirm(
      `Move session "${session.name}" to Trash? Use the "Restore" button to bring it back, or permanently delete it from there.`
    );
    if (ok) await deleteTab(session.id);
  }

  if (confirmingUnlock) {
    return (
      <Modal open title="Unlock session" onClose={() => { setConfirmingUnlock(false); onClose(); }}>
        <p className="mb-4 text-sm text-base-400">
          Session "{session.name}" is locked. Hold the button below for 3 seconds to unlock it —
          releasing early cancels.
        </p>
        <HoldToUnlockButton onConfirm={handleConfirmUnlock} />
      </Modal>
    );
  }

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: y, left: x }}
      className="z-50 min-w-[180px] rounded-lg border border-base-700 bg-base-900 py-1 shadow-2xl"
    >
      {session.locked ? (
        <button
          onClick={() => setConfirmingUnlock(true)}
          className="block w-full px-3 py-2 text-left text-sm text-base-100 hover:bg-base-800"
        >
          Unlock session
        </button>
      ) : (
        <button
          onClick={handleLock}
          className="block w-full px-3 py-2 text-left text-sm text-base-100 hover:bg-base-800"
        >
          Lock session
        </button>
      )}
      {/* Session đang khoá thì không xoá được (assertSessionUnlocked ở main.ts cũng chặn) — ẩn luôn
          cho khỏi bấm rồi báo lỗi. */}
      {!session.locked && (
        <button
          onClick={handleMoveToTrash}
          className="block w-full border-t border-base-800 px-3 py-2 text-left text-sm text-danger-500 hover:bg-base-800"
        >
          Move to trash
        </button>
      )}
    </div>
  );
}
