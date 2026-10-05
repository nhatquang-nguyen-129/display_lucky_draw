import { useEffect, useRef, useState } from "react";
import { Session } from "@/types";
import { useSession } from "@/context/SessionContext";
import { LOCK_FULL, LOCK_INPUTS, LOCK_NONE } from "@/lib/sessionLock";
import Modal from "./Modal";
import HoldToUnlockButton from "./HoldToUnlockButton";

interface Props {
  session: Session;
  x: number;
  y: number;
  onClose: () => void;
  onChanged: () => void; // gọi lại sessions:list ở TabBar sau khi đổi trạng thái khoá
}

type LockLevel = Session["locked"];

// Mức "chặt" của từng trạng thái: Full lock > Input lock > mở. Đổi sang mức CHẶT hơn có hiệu lực ngay;
// nới lỏng (kể cả Full → Input) bắt buộc giữ nút 3 giây, tránh 1 cú bấm nhầm làm mất tác dụng khoá.
const STRICTNESS: Record<LockLevel, number> = { 0: 0, 2: 1, 1: 2 };

// Menu chuột phải (Windows) / secondary-click trên trackpad (macOS — browser tự chuẩn hoá qua sự
// kiện contextmenu, không cần code riêng theo hệ điều hành) trên 1 tab session: đổi mức khoá (không
// phải bảo mật, không password — chỉ tránh nhầm lẫn chỉnh sửa, xem docs/architecture/session-lock.md):
// "Lock inputs" (Input lock — chỉ khoá participant/prize, vẫn quay số + sửa Landing) hoặc "Lock
// session" (Full lock — chỉ xem). Và Move to trash (chuyển vào data/.trash/, KHÁC Close/nút × ở
// TabBar.tsx — Close chỉ ẩn tab, không đụng file). Khôi phục hoặc xoá vĩnh viễn khỏi trash: nút
// "Restore" ở TabBar.tsx, mở RestoreModal.tsx.
export default function SessionLockMenu({ session, x, y, onClose, onChanged }: Props) {
  const { deleteTab } = useSession();
  // Mức khoá đang chờ xác nhận bằng giữ nút 3 giây (chỉ khi nới lỏng), null = đang hiện menu.
  const [confirmingTarget, setConfirmingTarget] = useState<LockLevel | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmingTarget !== null) return; // modal Unlock tự xử lý đóng riêng
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
  }, [confirmingTarget, onClose]);

  function choose(target: LockLevel) {
    if (STRICTNESS[target] < STRICTNESS[session.locked]) setConfirmingTarget(target);
    else void applyLock(target);
  }

  async function applyLock(target: LockLevel) {
    const result = await window.api.sessions.setLocked({ id: session.id, locked: target });
    onClose();
    if (!result.ok) {
      alert(`Close the ${result.openWindows.join(", ")} window of session "${session.name}" before locking it.`);
      return;
    }
    onChanged();
  }

  async function handleConfirmHold() {
    if (confirmingTarget === null) return;
    await window.api.sessions.setLocked({ id: session.id, locked: confirmingTarget });
    onChanged();
    setConfirmingTarget(null);
    onClose();
  }

  async function handleMoveToTrash() {
    onClose();
    const ok = confirm(
      `Move session "${session.name}" to Trash? Use the "Restore" button to bring it back, or permanently delete it from there.`
    );
    if (ok) await deleteTab(session.id);
  }

  if (confirmingTarget !== null) {
    const toInputLock = confirmingTarget === LOCK_INPUTS;
    return (
      <Modal
        open
        title={toInputLock ? "Switch to input lock" : session.locked === LOCK_INPUTS ? "Unlock inputs" : "Unlock session"}
        onClose={() => { setConfirmingTarget(null); onClose(); }}
      >
        <p className="mb-4 text-sm text-base-400">
          {toInputLock
            ? `Session "${session.name}" is fully locked. Switching to input lock re-enables drawing, Landing Builder and Presentation, while participants and prizes stay locked.`
            : session.locked === LOCK_INPUTS
              ? `Participants and prizes of session "${session.name}" are locked. Unlocking makes them editable again.`
              : `Session "${session.name}" is locked.`}{" "}
          Hold the button below for 3 seconds to confirm — releasing early cancels.
        </p>
        <HoldToUnlockButton onConfirm={handleConfirmHold} />
      </Modal>
    );
  }

  const itemClass = "block w-full px-3 py-2 text-left text-sm text-base-100 hover:bg-base-800";
  const hintClass = "block text-xs text-base-500";

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: y, left: x }}
      className="z-50 min-w-[220px] rounded-lg border border-base-700 bg-base-900 py-1 shadow-2xl"
    >
      {session.locked === LOCK_NONE && (
        <button onClick={() => choose(LOCK_INPUTS)} className={itemClass}>
          Lock inputs
          <span className={hintClass}>Participants & prizes only — drawing and Landing still work</span>
        </button>
      )}
      {session.locked !== LOCK_FULL && (
        <button onClick={() => choose(LOCK_FULL)} className={itemClass}>
          Lock session
          <span className={hintClass}>View only — blocks everything</span>
        </button>
      )}
      {session.locked === LOCK_FULL && (
        <button onClick={() => choose(LOCK_INPUTS)} className={itemClass}>
          Switch to input lock
          <span className={hintClass}>Re-enable drawing and Landing, keep inputs locked</span>
        </button>
      )}
      {session.locked !== LOCK_NONE && (
        <button onClick={() => choose(LOCK_NONE)} className={itemClass}>
          {session.locked === LOCK_FULL ? "Unlock session" : "Unlock inputs"}
        </button>
      )}
      {/* Session đang khoá (mức nào cũng vậy) thì không xoá được — xoá = mất luôn dữ liệu đầu vào
          (assertInputsUnlocked ở main.ts cũng chặn), ẩn luôn cho khỏi bấm rồi báo lỗi. */}
      {session.locked === LOCK_NONE && (
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
