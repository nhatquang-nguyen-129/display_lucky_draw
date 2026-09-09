import { useEffect, useRef, useState } from "react";
import { WinnerTransitionEffect } from "@/lib/landing/types";

// Dùng chung bởi WinnerNameView.tsx và TextView.tsx (khi bật `syncWithDraw`) — cả 2 đều rút gọn về
// đúng 1 hình dạng: "có 1 chuỗi khi đã revealed, rỗng khi chưa/không còn nữa", đi qua CÙNG 1 cơ chế
// 2 lớp chuyển cảnh (current/previous). Tách ra đây để không lặp lại state machine này ở 2 nơi.

// Phải khớp đúng 0.5s khai báo cho các class winner-transition-*-in/out trong landingEffects.css —
// đổi 1 trong 2 chỗ thì phải đổi luôn chỗ còn lại.
export const TRANSITION_MS = 500;

export const DISAPPEAR_CLASS: Record<WinnerTransitionEffect, string> = {
  none: "",
  crossfade: "winner-transition-crossfade-out",
  slideUp: "winner-transition-slideUp-out",
  slideDown: "winner-transition-slideDown-out",
  zoom: "winner-transition-zoom-out",
};
export const APPEAR_CLASS: Record<WinnerTransitionEffect, string> = {
  none: "",
  crossfade: "winner-transition-crossfade-in",
  slideUp: "winner-transition-slideUp-in",
  slideDown: "winner-transition-slideDown-in",
  zoom: "winner-transition-zoom-in",
};

// `resultId` = data?.results[0]?.id — undefined nghĩa là Idle/Reset (chưa/không còn candidate nào).
// Đổi giá trị (kể cả từ 1 id CŨ sang 1 id MỚI, không qua undefined) tự ẩn NGAY LẬP TỨC trước
// (mirror đúng khoảng trống "tên cũ biến mất lúc lượt Draw mới vừa bắt đầu" đã có từ trước), rồi chờ
// đúng `revealDelayMs` (khớp thời lượng Wheel quay xong hẳn, 0 nếu trang không có Wheel) mới bật lại.
export function useRevealed(resultId: string | undefined, revealDelayMs: number): boolean {
  const [revealed, setRevealed] = useState(() => resultId !== undefined && revealDelayMs <= 0);

  useEffect(() => {
    if (resultId === undefined) {
      setRevealed(false);
      return;
    }
    setRevealed(false);
    if (revealDelayMs <= 0) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => setRevealed(true), revealDelayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId, revealDelayMs]);

  return revealed;
}

// "current"/"previous" — 2 lớp text CHỒNG LÊN NHAU trong lúc chuyển cảnh: "previous" = đoạn VỪA MẤT
// ĐI (đang chạy `disappearEffect`, class "-out"), "current" = đoạn ĐANG HIỆN TỚI (đang chạy
// `appearEffect`, class "-in"). `previous === null` = trạng thái đứng yên bình thường, không có gì
// đang chuyển cảnh. Cả 2 field "none" thì bỏ qua hẳn cơ chế 2 lớp, luôn đổi tức thì.
export function useRevealTransition(
  text: string,
  appearEffect: WinnerTransitionEffect,
  disappearEffect: WinnerTransitionEffect
): { current: string; previous: string | null } {
  const [{ current, previous }, setLayers] = useState<{ current: string; previous: string | null }>({
    current: text,
    previous: null,
  });
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (text === prevTextRef.current) return;
    const old = prevTextRef.current;
    prevTextRef.current = text;
    if (appearEffect === "none" && disappearEffect === "none") {
      setLayers({ current: text, previous: null });
      return;
    }
    setLayers({ current: text, previous: old });
    const timer = setTimeout(() => setLayers((s) => ({ current: s.current, previous: null })), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [text, appearEffect, disappearEffect]);

  return { current, previous };
}
