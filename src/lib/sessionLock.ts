import { Session } from "@/types";

// 2 mức khoá session (cột sessions.locked) — bản renderer của LOCK_FULL/LOCK_INPUTS trong electron/db.ts
// (electron/ không import được src/). Chặn THẬT nằm ở assertInputsUnlocked/assertSessionUnlocked trong
// main process; các hàm này chỉ để disable nút + tooltip. Xem docs/architecture/session-lock.md.
export const LOCK_NONE = 0;
export const LOCK_FULL = 1;
export const LOCK_INPUTS = 2;

/** Participant/prize/Data Editor bị khoá — đúng khi có BẤT KỲ mức khoá nào. */
export function inputsLocked(session: Pick<Session, "locked">): boolean {
  return session.locked !== LOCK_NONE;
}

/** Khoá toàn bộ (chỉ xem) — chặn cả quay số, Builder, Presentation, đổi tên, đóng tab. */
export function fullyLocked(session: Pick<Session, "locked">): boolean {
  return session.locked === LOCK_FULL;
}

/** Tooltip cho nút sửa participant/prize khi bị khoá, undefined khi không khoá. */
export function inputLockTitle(session: Pick<Session, "locked">): string | undefined {
  if (fullyLocked(session)) return "Session is locked — unlock to edit";
  if (inputsLocked(session)) return "Inputs are locked — unlock inputs to edit";
  return undefined;
}
