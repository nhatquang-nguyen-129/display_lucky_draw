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
// Trả về CHUỖI ĐANG THỰC SỰ hiện trên màn hình ngay lúc này ("" = không hiện gì) — implement đúng 3
// trạng thái của Winner Name (xem doc-comment WinnerNameProps trong types.ts):
//   1. Idle (resultId undefined): "" ngay lập tức, không delay nào áp dụng — Reset là hành động rõ
//      ràng của người vận hành, không phải 1 lượt Draw mới cần chờ Disappear.
//   2. resultId đổi sang 1 giá trị MỚI, đang KHÔNG hiện gì (Idle → có candidate, lượt Draw đầu tiên):
//      giữ "" cho tới đúng `appearDelayMs` (tính từ lúc resultId đổi = lúc bấm Draw) thì đổi sang
//      `value` (tên người trúng) — không có gì để Disappear cả.
//   3. resultId đổi sang 1 giá trị MỚI, đang CÓ SẴN 1 chuỗi hiện (lượt Draw tiếp theo): GIỮ NGUYÊN
//      chuỗi CŨ tại chỗ cho tới đúng `disappearDelayMs` thì đổi về "" (disappearEffect chạy), ĐỘC LẬP
//      với việc sau đúng `appearDelayMs` (CÙNG tính từ lúc resultId đổi, không xếp hàng chờ nhau) thì
//      đổi sang `value` MỚI (appearEffect chạy) — cả 2 mốc đều đo từ đúng 1 sự kiện (bấm Draw).
// `value` chỉ được ĐỌC vào lúc mỗi timer thực sự chạy (qua closure của effect, ứng với đúng
// resultId hiện tại) — KHÔNG hiện ngay dù `value` (vd winnerName tính từ data.results[0]) đã đổi
// tức thì lúc bấm Draw, tránh bug "tên MỚI nhảy vào chỗ tên CŨ" trước khi Disappear kịp chạy.
export function useRevealed(
  resultId: string | undefined,
  value: string,
  appearDelayMs: number,
  disappearDelayMs: number,
  // DrawSequenceActions.resetSeq (xem doc-comment ở types.ts) — tăng mỗi lần resetSession() chạy
  // xong THẬT SỰ. Đổi giá trị (so bằng useRef, không phải dep của effect timer) ép `displayed` về ""
  // NGAY LẬP TỨC, HUỶ mọi timer Appear/Disappear đang chờ — tín hiệu TƯỜNG MINH từ đúng hành động
  // Reset, không suy luận qua resultId (vốn phải đợi `data`/`candidate` refresh xong mới đổi, có thể
  // lệch nhịp nếu 1 request refresh CŨ hơn lại resolve SAU, ghi đè nhầm state mới — xem
  // useLandingData.ts). undefined (Builder canvas, không có sequence thật) = bỏ qua cơ chế này.
  resetSeq?: number
): string {
  const [displayed, setDisplayed] = useState("");
  const prevIdRef = useRef(resultId);
  const hadPreviousRef = useRef(false);
  const prevResetSeqRef = useRef(resetSeq);

  // setState-trong-render có điều kiện + so KHÁC giá trị — pattern React hợp lệ (React huỷ output
  // render hiện tại rồi render lại ngay TRƯỚC khi paint, xem thêm ở useRevealTransition bên dưới).
  if (prevResetSeqRef.current !== resetSeq) {
    prevResetSeqRef.current = resetSeq;
    hadPreviousRef.current = false;
    setDisplayed("");
  } else if (prevIdRef.current !== resultId) {
    // CHỈ xử lý nhánh Idle (ẩn ngay) ở đây — nhánh "có resultId mới" để nguyên `displayed` (tên CŨ
    // nếu có) và giao lại cho effect bên dưới đổi đúng lúc theo 2 mốc Delay, đồng thời ghi lại đã có
    // tên đang hiện hay chưa (`displayed` lúc này VẪN là giá trị của lượt TRƯỚC, effect chưa kịp đổi).
    if (resultId === undefined) {
      setDisplayed("");
    } else {
      hadPreviousRef.current = displayed !== "";
    }
  }
  prevIdRef.current = resultId;

  useEffect(() => {
    if (resultId === undefined) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hadPreviousRef.current) {
      timers.push(setTimeout(() => setDisplayed(""), Math.max(0, disappearDelayMs)));
    }
    timers.push(setTimeout(() => setDisplayed(value), Math.max(0, appearDelayMs)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId, value, appearDelayMs, disappearDelayMs, resetSeq]);

  return displayed;
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
