import { useCallback, useReducer, useRef } from "react";
import { LandingConfig } from "@/lib/landing/types";

// Undo/Redo cho Landing Builder — KHÁC kiểu Command Pattern {execute, undo} của Data Editor
// (src/lib/dataEditor/history.ts): LandingConfig là 1 object JSON THUẦN, không có hàng trăm dòng cần
// diff từng ô như bảng dữ liệu, nên đơn giản hơn nhiều khi lưu NGUYÊN 1 bản snapshot mỗi bước thay vì
// viết riêng 1 cặp execute/undo cho từng loại thao tác (kéo-di-chuyển, resize, sửa field, đổi
// background, xoá component...) — snapshot JSON of LandingConfig ở quy mô 1 trang landing (vài chục
// component) không đáng kể về bộ nhớ.
//
// 2 KIỂU thao tác cần gộp khác nhau:
//   - Rời rạc (Add/Delete component, Reorder layers, ẩn/hiện layer...) — LUÔN tách thành 1 bước lịch
//     sử RIÊNG, gọi `set(updater, { commit: true, label })`.
//   - Liên tục (kéo-di-chuyển/resize trên canvas — bắn onUpdateComponent MỖI mousemove; gõ chữ liên
//     tục vào 1 ô input; kéo slider/color picker) — GỘP chung vào ĐÚNG 1 bước nếu các lần gọi cách
//     nhau dưới `COALESCE_WINDOW_MS`, tách bước mới khi có khoảng dừng đủ lâu (nhả chuột xong đứng
//     yên, ngừng gõ...). Không cần biết "gesture" bắt đầu/kết thúc lúc nào ở phía gọi (LandingCanvas.tsx
//     không cần sửa gì) — thời gian tự phân định ranh giới.
export interface ConfigHistoryEntry {
  label: string;
  snapshot: LandingConfig;
}

const MAX_HISTORY = 100;
const COALESCE_WINDOW_MS = 600;

export function useConfigHistory() {
  const configRef = useRef<LandingConfig | null>(null);
  const pastRef = useRef<ConfigHistoryEntry[]>([]);
  const futureRef = useRef<ConfigHistoryEntry[]>([]);
  const lastCommitTimeRef = useRef(0);
  const [, forceRender] = useReducer((c) => c + 1, 0);

  const set = useCallback(
    (updater: (prev: LandingConfig) => LandingConfig, opts?: { commit?: boolean; label?: string }) => {
      const prev = configRef.current;
      if (!prev) return;
      const next = updater(prev);
      const now = Date.now();
      // Bước ĐẦU TIÊN sau khi reset (pastRef rỗng), hoặc bị ép commit, hoặc đã dừng quá lâu kể từ lần
      // sửa gần nhất — TÁCH bước mới. Ngược lại (đang trong 1 đợt liên tục) — gộp vào bước hiện tại,
      // KHÔNG đẩy thêm snapshot (đỉnh pastRef vẫn giữ đúng trạng thái TRƯỚC cả đợt).
      const startNewEntry = !!opts?.commit || pastRef.current.length === 0 || now - lastCommitTimeRef.current > COALESCE_WINDOW_MS;
      if (startNewEntry) {
        const nextPast = [...pastRef.current, { label: opts?.label ?? "Edited", snapshot: prev }];
        pastRef.current = nextPast.length > MAX_HISTORY ? nextPast.slice(nextPast.length - MAX_HISTORY) : nextPast;
        futureRef.current = [];
      }
      lastCommitTimeRef.current = now;
      configRef.current = next;
      forceRender();
    },
    []
  );

  const undo = useCallback(() => {
    const prev = configRef.current;
    const entry = pastRef.current[pastRef.current.length - 1];
    if (!prev || !entry) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, { label: entry.label, snapshot: prev }];
    configRef.current = entry.snapshot;
    lastCommitTimeRef.current = 0; // ngắt gộp — thao tác kế tiếp phải tính là bước MỚI, không lẫn vào trước lúc undo
    forceRender();
  }, []);

  const redo = useCallback(() => {
    const prev = configRef.current;
    const entry = futureRef.current[futureRef.current.length - 1];
    if (!prev || !entry) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, { label: entry.label, snapshot: prev }];
    configRef.current = entry.snapshot;
    lastCommitTimeRef.current = 0;
    forceRender();
  }, []);

  // Nhảy thẳng tới 1 mốc trong lịch sử — targetLength = số bước đã áp dụng tính từ đầu (giống hệt
  // jumpTo trong dataEditor/history.ts). Dùng biến cục bộ `cur` thay vì đọc configRef giữa chừng vì
  // nhiều bước undo/redo dồn lại trong 1 lần gọi.
  const jumpTo = useCallback((targetLength: number) => {
    let cur = configRef.current;
    if (!cur) return;
    const past = [...pastRef.current];
    const future = [...futureRef.current];
    while (past.length > targetLength) {
      const entry = past.pop()!;
      future.push({ label: entry.label, snapshot: cur });
      cur = entry.snapshot;
    }
    while (past.length < targetLength && future.length > 0) {
      const entry = future.pop()!;
      past.push({ label: entry.label, snapshot: cur });
      cur = entry.snapshot;
    }
    pastRef.current = past;
    futureRef.current = future;
    configRef.current = cur;
    lastCommitTimeRef.current = 0;
    forceRender();
  }, []);

  // Nạp state hoàn toàn mới (mở session lần đầu, hoặc Discard) — xoá sạch lịch sử, không cho Undo lùi
  // về trước thời điểm này.
  const reset = useCallback((newConfig: LandingConfig) => {
    configRef.current = newConfig;
    pastRef.current = [];
    futureRef.current = [];
    lastCommitTimeRef.current = 0;
    forceRender();
  }, []);

  return {
    config: configRef.current,
    set,
    reset,
    undo,
    redo,
    jumpTo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyLabels: pastRef.current.map((e) => e.label),
  };
}
