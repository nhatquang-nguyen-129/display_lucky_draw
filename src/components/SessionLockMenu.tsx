import { useEffect, useRef, useState } from "react";
import { Session } from "@/types";
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
// kiện contextmenu, không cần code riêng theo hệ điều hành) trên 1 tab session, chỉ có đúng 1 hành
// động: Lock hoặc Unlock tuỳ trạng thái hiện tại. Không phải bảo mật (không password) — chỉ tránh
// nhầm lẫn chỉnh sửa sau khi đã quay xong, xem docs/architecture (Session Lock).
export default function SessionLockMenu({ session, x, y, onClose, onChanged }: Props) {
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
    </div>
  );
}
