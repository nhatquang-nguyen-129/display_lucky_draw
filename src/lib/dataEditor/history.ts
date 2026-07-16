import { useRef, useState } from "react";
import { EditorState } from "./types";

/**
 * Mọi thao tác (sửa 1 ô, xoá hàng loạt, Clean, Generate...) đều là 1 Command —
 * đúng theo yêu cầu: 1 cơ chế Undo/Redo duy nhất cho cả thao tác đơn lẻ lẫn batch.
 *
 * execute/undo là pure function: (state cũ) -> (state mới), không side-effect,
 * nên History có thể replay/undo bao nhiêu lần cũng không lo lệch dữ liệu.
 */
export interface Command {
  label: string; // hiển thị trong Edit History, vd "Normalize Phone (12 dòng)"
  execute: (state: EditorState) => EditorState;
  undo: (state: EditorState) => EditorState;
}

const MAX_HISTORY = 100; // giới hạn để tránh phình bộ nhớ khi sửa liên tục hàng trăm lượt

export function useCommandHistory(initial: EditorState) {
  const [state, setState] = useState(initial);
  const pastRef = useRef<Command[]>([]);
  const futureRef = useRef<Command[]>([]);
  const savedIndexRef = useRef(0);
  const [, bumpTick] = useState(0);
  const bump = () => bumpTick((t) => t + 1);

  function run(command: Command) {
    const next = command.execute(state);
    setState(next);
    const nextPast = [...pastRef.current, command];
    pastRef.current = nextPast.length > MAX_HISTORY ? nextPast.slice(nextPast.length - MAX_HISTORY) : nextPast;
    futureRef.current = [];
    bump();
  }

  function undo() {
    const cmd = pastRef.current[pastRef.current.length - 1];
    if (!cmd) return;
    setState(cmd.undo(state));
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, cmd];
    bump();
  }

  function redo() {
    const cmd = futureRef.current[futureRef.current.length - 1];
    if (!cmd) return;
    setState(cmd.execute(state));
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, cmd];
    bump();
  }

  /** Nạp lại state hoàn toàn mới (sau khi load từ DB hoặc sau khi Save) — xoá sạch lịch sử. */
  function reset(newState: EditorState) {
    setState(newState);
    pastRef.current = [];
    futureRef.current = [];
    savedIndexRef.current = 0;
    bump();
  }

  function markSaved() {
    savedIndexRef.current = pastRef.current.length;
    bump();
  }

  return {
    state,
    run,
    undo,
    redo,
    reset,
    markSaved,
    // dirty = vị trí hiện tại trong lịch sử khác với mốc đã lưu gần nhất.
    // Tính chất hay: nếu Undo lùi đúng về mốc đã lưu, dirty tự về false.
    dirty: pastRef.current.length !== savedIndexRef.current,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyLabels: pastRef.current.map((c) => c.label),
  };
}
