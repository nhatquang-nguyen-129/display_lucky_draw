import { useEffect, useRef, useState } from "react";
import { DrawCycleConfig, DrawPhaseEffectConfig, DrawRestState, WinnerTransitionEffect } from "@/lib/landing/types";

// `useRevealed`/`useRevealTransition` — dùng bởi WinnerNameView.tsx (khi bật `syncWithDraw` là mặc
// định, không tắt được) — rút gọn về đúng 1 hình dạng: "có 1 chuỗi khi đã revealed, rỗng khi
// chưa/không còn nữa", đi qua CÙNG 1 cơ chế 2 lớp chuyển cảnh (current/previous). CHỈ hợp với
// component có NỘI DUNG THẬT SỰ đổi theo từng lượt quay (tên người trúng) — không migrate sang
// `useDrawCycleVisibility` vì lý do đó (xem doc-comment LiveTextPanel.tsx).
//
// `useDrawCycleVisibility` (cuối file) là 1 MODEL KHÁC, tổng quát hơn — xem doc-comment
// DrawCycleConfig trong types.ts — dùng cho ImageView.tsx VÀ TextView.tsx (cả 2 hiện 1 thứ TĨNH do
// người dùng tự đặt, không đổi theo từng lượt quay): KHÔNG gắn cứng "Appear = lúc Draw, Disappear =
// lúc Redraw" như hook trên, mà để đúng 3 mốc thật (Idle/Draw/Redraw) LUÔN xen kẽ hiện/ẩn theo đúng 1
// trạng thái nghỉ duy nhất (`idleState`). Cả 2 model CÙNG TỒN TẠI trong file này — Winner Name (nội
// dung đổi theo lượt) sẽ KHÔNG BAO GIỜ migrate sang model dưới, đây không phải việc "chưa làm tới".

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
  // NGAY LẬP TỨC (nếu `idleState !== "appear"`), HUỶ mọi timer Appear/Disappear đang chờ — tín hiệu
  // TƯỜNG MINH từ đúng hành động Reset, không suy luận qua resultId (vốn phải đợi `data`/`candidate`
  // refresh xong mới đổi, có thể lệch nhịp nếu 1 request refresh CŨ hơn lại resolve SAU, ghi đè nhầm
  // state mới — xem useLandingData.ts). undefined (Builder canvas, không có sequence thật) = bỏ qua
  // cơ chế này.
  resetSeq?: number,
  // "disappear" (mặc định) = hành vi cũ, ẩn ngay khi Idle/Reset. "appear" = GIỮ NGUYÊN chuỗi đang
  // hiện, không tự xoá gì cả — xem doc-comment WinnerNameProps.idleState trong types.ts. KHÔNG ảnh
  // hưởng state khởi tạo (`useState("")` — luôn rỗng lúc mount, giữ nguyên quyết định "Landing luôn
  // mở ở Idle, không restore winner cũ").
  idleState: DrawRestState = "disappear"
): string {
  const [displayed, setDisplayed] = useState("");
  const prevIdRef = useRef(resultId);
  const hadPreviousRef = useRef(false);
  const prevResetSeqRef = useRef(resetSeq);

  // setState-trong-render có điều kiện + so KHÁC giá trị — pattern React hợp lệ (React huỷ output
  // render hiện tại rồi render lại ngay TRƯỚC khi paint, xem thêm ở useRevealTransition bên dưới).
  if (prevResetSeqRef.current !== resetSeq) {
    prevResetSeqRef.current = resetSeq;
    if (idleState !== "appear") {
      hadPreviousRef.current = false;
      setDisplayed("");
    }
  } else if (prevIdRef.current !== resultId) {
    // CHỈ xử lý nhánh Idle (ẩn ngay) ở đây — nhánh "có resultId mới" để nguyên `displayed` (tên CŨ
    // nếu có) và giao lại cho effect bên dưới đổi đúng lúc theo 2 mốc Delay, đồng thời ghi lại đã có
    // tên đang hiện hay chưa (`displayed` lúc này VẪN là giá trị của lượt TRƯỚC, effect chưa kịp đổi).
    if (resultId === undefined) {
      if (idleState !== "appear") setDisplayed("");
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
// ĐI (đang chạy hiệu ứng biến mất, trả về sẵn thành `previousClass` — CSS class thật, không phải tên
// effect thô, vì effect dùng có thể là `disappearEffect` HOẶC `idleEffect` tuỳ nguồn gốc chuyển cảnh,
// xem bên dưới), "current" = đoạn ĐANG HIỆN TỚI (đang chạy `appearEffect`, class "-in"). `previous ===
// null` = trạng thái đứng yên bình thường, không có gì đang chuyển cảnh.
//
// `resetSeq`/`idleEffect`/`idleDelayMs`: khi `text` đổi VÌ Reset (resetSeq vừa đổi — tức
// `useRevealed` ở trên vừa ép `displayed` về "" NGAY LẬP TỨC để giữ đúng tính đúng đắn dữ liệu, xem
// doc-comment ở đó), lớp VISUAL "previous" ở đây KHÔNG bắt buộc phải biến mất ngay theo — nó có thể
// đứng yên (hiện nguyên tên cũ) thêm `idleDelayMs` rồi mới chạy hiệu ứng `idleEffect` (khác hẳn
// `disappearEffect`/không delay dùng cho Redraw thường) — tách biệt HOÀN TOÀN tính đúng đắn dữ liệu
// (đã xong ngay trong `useRevealed`) khỏi tốc độ hiệu ứng NHÌN THẤY (thuần cosmetic, xử lý ở đây).
export function useRevealTransition(
  text: string,
  appearEffect: WinnerTransitionEffect,
  disappearEffect: WinnerTransitionEffect,
  resetSeq?: number,
  idleEffect?: WinnerTransitionEffect,
  idleDelayMs?: number
): { current: string; previous: string | null; previousClass: string } {
  const [{ current, previous, previousClass }, setLayers] = useState<{
    current: string;
    previous: string | null;
    previousClass: string;
  }>({ current: text, previous: null, previousClass: "" });
  const prevTextRef = useRef(text);
  const prevResetSeqRef = useRef(resetSeq);
  const viaResetRef = useRef(false);

  // CHỈ đánh dấu "viaReset" khi resetSeq đổi VÀ `text` THẬT SỰ sẽ đổi theo (so trực tiếp với
  // `prevTextRef.current` NGAY TRONG RENDER, trước khi effect bên dưới kịp chạy) — nếu
  // `idleState="appear"` khiến `useRevealed` KHÔNG xoá `displayed` (text giữ nguyên), effect dưới sẽ
  // bail sớm ở `text === prevTextRef.current` và KHÔNG BAO GIỜ dùng/dọn flag này — không canh ở đây
  // thì flag còn "true" dây dưa sang đúng lượt đổi text tiếp theo (1 lượt Draw thường), khiến nó bị
  // nhầm dùng `idleEffect` thay vì `disappearEffect`/`appearEffect` thật.
  if (prevResetSeqRef.current !== resetSeq) {
    prevResetSeqRef.current = resetSeq;
    viaResetRef.current = text !== prevTextRef.current;
  }

  useEffect(() => {
    if (text === prevTextRef.current) return;
    const old = prevTextRef.current;
    prevTextRef.current = text;
    const viaReset = viaResetRef.current;
    viaResetRef.current = false;

    const usedDisappearEffect = viaReset ? idleEffect ?? "none" : disappearEffect;
    const delay = viaReset ? Math.max(0, idleDelayMs ?? 0) : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function startTransition() {
      if (appearEffect === "none" && usedDisappearEffect === "none") {
        setLayers({ current: text, previous: null, previousClass: "" });
        return;
      }
      setLayers({ current: text, previous: old, previousClass: DISAPPEAR_CLASS[usedDisappearEffect] });
      timers.push(setTimeout(() => setLayers((s) => ({ ...s, previous: null, previousClass: "" })), TRANSITION_MS));
    }

    if (delay > 0) {
      timers.push(setTimeout(startTransition, delay));
    } else {
      startTransition();
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, appearEffect, disappearEffect, idleEffect, idleDelayMs]);

  return { current, previous, previousClass };
}

type FiredPhase = "idle" | "draw" | "redraw";

/**
 * Model hiện/ẩn TỔNG QUÁT theo đúng 3 mốc thật của quy trình quay (Idle/Draw/Redraw) — xem
 * doc-comment DrawCycleConfig trong types.ts. Khác `useRevealed` ở trên (gắn cứng Appear=Draw,
 * Disappear=Redraw, Idle luôn ẩn tức thì không cấu hình được): ở đây Idle chỉ có ĐÚNG 1 input tự do
 * (`config.idleState`) — Draw/Redraw có thêm lựa chọn "none" (không làm gì) ngoài giá trị bị ràng
 * buộc theo idleState (Panel đã đảm bảo hợp lệ, xem ImagePanel.tsx) — chỉ còn Effect + Delay cho
 * từng bước có action thật — dùng cho ImageView.tsx.
 *
 * Trả về `shown` (có nên render nội dung ngay bây giờ hay không) + `transitionClass` (class hiệu ứng
 * ĐANG chạy, "" nếu đứng yên). Ẩn đi KHÔNG tắt `shown` ngay — giữ `shown = true` suốt TRANSITION_MS để
 * hiệu ứng biến mất kịp chạy hết trên nội dung thật, chỉ tắt hẳn sau khi hết hiệu ứng (đối xứng với
 * hiện ra: bật `shown = true` NGAY rồi mới chạy hiệu ứng xuất hiện đè lên). `redrawAction !== "none"`
 * chạy `redrawEffect` (xử lý nội dung CŨ), rồi — NẾU `drawAction !== "none"` — TỰ ĐỘNG chạy tiếp bước
 * "hiện lại" bằng CHÍNH `drawEffect` (không có field riêng — công bố kết quả là 1 hành động chung) —
 * `drawEffect.delayMs` đo từ lúc `redrawEffect` chạy XONG HẲN (delay + thời lượng hiệu ứng, hoặc 0
 * nếu effect "none"), nối tiếp thật, không đo song song từ lúc bấm Redraw.
 */
export function useDrawCycleVisibility(
  resultId: string | undefined,
  config: DrawCycleConfig,
  resetSeq?: number
): { shown: boolean; transitionClass: string } {
  const restVisible = config.idleState === "appear";
  const [shown, setShown] = useState(restVisible);
  const [transitionClass, setTransitionClass] = useState("");

  // Đã từng có ít nhất 1 resultId THẬT (khác Idle) hay chưa — phân biệt "Draw" (từ Idle) với "Redraw"
  // (đang có kết quả trước đó), giống hadPreviousRef trong useRevealed ở trên.
  const hadDrawRef = useRef(false);
  const prevIdRef = useRef(resultId);
  const prevResetSeqRef = useRef(resetSeq);
  const firedPhaseRef = useRef<FiredPhase | null>(null);

  // Xác định phase nào VỪA xảy ra NGAY trong lúc render (đồng bộ, giống pattern useRevealed) — chỉ
  // ghi lại vào ref để effect bên dưới đọc, không tự chạy timer ở đây.
  if (prevResetSeqRef.current !== resetSeq) {
    prevResetSeqRef.current = resetSeq;
    hadDrawRef.current = false;
    firedPhaseRef.current = "idle";
  } else if (prevIdRef.current !== resultId) {
    if (resultId === undefined) {
      hadDrawRef.current = false;
      firedPhaseRef.current = "idle";
    } else if (!hadDrawRef.current) {
      hadDrawRef.current = true;
      firedPhaseRef.current = "draw";
    } else {
      firedPhaseRef.current = "redraw";
    }
  }
  prevIdRef.current = resultId;

  // Key đổi ĐÚNG 1 lần mỗi khi có 1 phase mới cần chạy — tách khỏi re-render thường (vd đổi màu/size
  // trong Properties Panel không được kích hoạt lại animation).
  const fireKey = `${resultId ?? "__idle__"}:${resetSeq ?? 0}`;

  useEffect(() => {
    const firedPhase = firedPhaseRef.current;
    if (!firedPhase) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runStep(toVisible: boolean, step: DrawPhaseEffectConfig | undefined) {
      const delay = Math.max(0, step?.delayMs ?? 0);
      const effect = step?.effect ?? "none";
      timers.push(
        setTimeout(() => {
          if (toVisible) {
            setShown(true);
            if (effect !== "none") {
              setTransitionClass(APPEAR_CLASS[effect]);
              timers.push(setTimeout(() => setTransitionClass(""), TRANSITION_MS));
            }
          } else if (effect !== "none") {
            setTransitionClass(DISAPPEAR_CLASS[effect]);
            timers.push(
              setTimeout(() => {
                setTransitionClass("");
                setShown(false);
              }, TRANSITION_MS)
            );
          } else {
            setShown(false);
          }
        }, delay)
      );
    }

    if (firedPhase === "idle") {
      runStep(restVisible, config.idleEffect);
    } else if (firedPhase === "draw") {
      if (config.drawAction === "none") return;
      runStep(!restVisible, config.drawEffect);
    } else {
      // Redraw: "none" = không làm gì (giữ nguyên trạng thái đang có). Khác "none" luôn TRÙNG
      // idleState (Panel đã ràng buộc) — chạy đúng 1 bước riêng (ẩn nội dung cũ), rồi — NẾU Draw có
      // action thật — tự động chạy tiếp bằng CHÍNH `drawEffect` để hiện nội dung mới (công bố kết quả
      // là 1 hành động chung, không có field riêng cho bước này).
      if (config.redrawAction === "none") return;
      const outEffect = config.redrawEffect?.effect ?? "none";
      const outDelay = Math.max(0, config.redrawEffect?.delayMs ?? 0);
      const outDuration = outEffect === "none" ? 0 : TRANSITION_MS;
      runStep(restVisible, config.redrawEffect);
      if (config.drawAction !== "none") {
        const inDelay = Math.max(0, config.drawEffect?.delayMs ?? 0);
        timers.push(
          setTimeout(() => runStep(!restVisible, config.drawEffect), outDelay + outDuration + inDelay)
        );
      }
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);

  return { shown, transitionClass };
}
