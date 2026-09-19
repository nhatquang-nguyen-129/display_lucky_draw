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

export type RevealPhase = "idle" | "draw" | "redraw";

export interface RevealState {
  // Chuỗi ĐANG THỰC SỰ hiện trên màn hình ngay lúc này ("" = không hiện gì).
  text: string;
  // Phase THẬT SỰ đã sinh ra giá trị `text` này ngay trên — LUÔN cập nhật ĐỒNG THỜI với `text` trong
  // CÙNG 1 lần setState (xem effect bên dưới), KHÔNG BAO GIỜ suy luận riêng ở nơi khác bằng cách so
  // sánh resetSeq tách rời (bản trước làm vậy ở useRevealTransition — đã gặp bug thật: `resetSeq` đổi
  // và `text` đổi theo KHÔNG NẰM CÙNG 1 LƯỢT RENDER khi `text` được set qua effect, nên so sánh
  // resetSeq ở 1 hook khác luôn có nguy cơ lệch nhịp, khiến Reset bị nhầm dùng hiệu ứng/delay của
  // Redraw thường). `null` = chưa từng có phase nào fire (lúc mount).
  phase: RevealPhase | null;
}

// `resultId` = data?.results[0]?.id — undefined nghĩa là Idle/Reset (chưa/không còn candidate nào).
// Trả về đúng 3 trạng thái của Winner Name (xem doc-comment WinnerNameProps trong types.ts):
//   1. Idle (resultId undefined, HOẶC resetSeq vừa đổi): "" ngay lập tức (trừ khi `idleState="appear"`
//      — xem doc-comment WinnerNameProps.idleState), không delay nào áp dụng — Reset là hành động rõ
//      ràng của người vận hành, không phải 1 lượt Draw mới cần chờ Disappear.
//   2. resultId đổi sang 1 giá trị MỚI, đang KHÔNG hiện gì (Idle → có candidate, lượt Draw đầu tiên):
//      giữ "" cho tới đúng `appearDelayMs` (tính từ lúc resultId đổi = lúc bấm Draw) thì đổi sang
//      `value` (tên người trúng) — không có gì để Disappear cả.
//   3. resultId đổi sang 1 giá trị MỚI, đang CÓ SẴN 1 chuỗi hiện (lượt Draw tiếp theo): GIỮ NGUYÊN
//      chuỗi CŨ tại chỗ cho tới đúng `disappearDelayMs` thì đổi về "" (disappearEffect chạy), ĐỘC LẬP
//      với việc sau đúng `appearDelayMs` (CÙNG tính từ lúc resultId đổi, không xếp hàng chờ nhau) thì
//      đổi sang `value` MỚI (appearEffect chạy) — cả 2 mốc đều đo từ đúng 1 sự kiện (bấm Draw).
// `value` chỉ được ĐỌC vào lúc mỗi timer thực sự chạy (qua closure của effect, ứng với đúng
// `fireKey` — resultId/resetSeq hiện tại) — KHÔNG hiện ngay dù `value` (vd winnerName tính từ
// data.results[0]) đã đổi tức thì lúc bấm Draw, tránh bug "tên MỚI nhảy vào chỗ tên CŨ" trước khi
// Disappear kịp chạy. Toàn bộ logic nằm TRONG effect (giống hệt kiến trúc `useDrawCycleVisibility` ở
// cuối file) — KHÔNG còn setState-trong-render như bản trước, tránh hẳn lớp bug do 2 lượt render (1
// lượt bị huỷ, 1 lượt chạy lại) đọc phải giá trị CHƯA kịp cập nhật.
export function useRevealed(
  resultId: string | undefined,
  value: string,
  appearDelayMs: number,
  disappearDelayMs: number,
  // DrawSequenceActions.resetSeq (xem doc-comment ở types.ts) — tăng mỗi lần resetSession() chạy
  // xong THẬT SỰ. Đổi giá trị ép về phase "idle" NGAY (nếu `idleState !== "appear"`), HUỶ mọi timer
  // Appear/Disappear đang chờ — tín hiệu TƯỜNG MINH từ đúng hành động Reset, không suy luận qua
  // resultId (vốn phải đợi `data`/`candidate` refresh xong mới đổi, có thể lệch nhịp nếu 1 request
  // refresh CŨ hơn lại resolve SAU, ghi đè nhầm state mới — xem useLandingData.ts). undefined (Builder
  // canvas, không có sequence thật) = bỏ qua cơ chế này.
  resetSeq?: number,
  // "disappear" (mặc định) = hành vi cũ, ẩn ngay khi Idle/Reset. "appear" = GIỮ NGUYÊN chuỗi đang
  // hiện, không tự xoá gì cả — xem doc-comment WinnerNameProps.idleState trong types.ts. KHÔNG ảnh
  // hưởng state khởi tạo (`useState` — luôn rỗng lúc mount, giữ nguyên quyết định "Landing luôn mở ở
  // Idle, không restore winner cũ").
  idleState: DrawRestState = "disappear"
): RevealState {
  const [state, setState] = useState<RevealState>({ text: "", phase: null });
  const prevIdRef = useRef(resultId);
  const hadPreviousRef = useRef(false);
  const prevResetSeqRef = useRef(resetSeq);
  const firedPhaseRef = useRef<RevealPhase | null>(null);

  // Xác định phase nào VỪA xảy ra NGAY trong lúc render (đồng bộ, giống pattern
  // useDrawCycleVisibility) — chỉ ghi lại vào ref để effect bên dưới đọc, KHÔNG tự setState ở đây.
  if (prevResetSeqRef.current !== resetSeq) {
    prevResetSeqRef.current = resetSeq;
    firedPhaseRef.current = "idle";
    hadPreviousRef.current = false;
  } else if (prevIdRef.current !== resultId) {
    if (resultId === undefined) {
      firedPhaseRef.current = "idle";
      hadPreviousRef.current = false;
    } else {
      firedPhaseRef.current = hadPreviousRef.current ? "redraw" : "draw";
      hadPreviousRef.current = true;
    }
  }
  prevIdRef.current = resultId;

  // Key đổi ĐÚNG 1 lần mỗi khi có 1 phase mới cần chạy — tách khỏi re-render thường.
  const fireKey = `${resultId ?? "__idle__"}:${resetSeq ?? 0}`;

  useEffect(() => {
    const phase = firedPhaseRef.current;
    if (!phase) return;
    if (phase === "idle") {
      if (idleState !== "appear") setState({ text: "", phase: "idle" });
      return;
    }
    // "draw" hoặc "redraw" — resultId chắc chắn có giá trị ở đây.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (phase === "redraw") {
      timers.push(setTimeout(() => setState({ text: "", phase: "redraw" }), Math.max(0, disappearDelayMs)));
    }
    timers.push(setTimeout(() => setState({ text: value, phase }), Math.max(0, appearDelayMs)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);

  return state;
}

// "current"/"previous" — 2 lớp text CHỒNG LÊN NHAU trong lúc chuyển cảnh: "previous" = đoạn VỪA MẤT
// ĐI (đang chạy hiệu ứng biến mất, trả về sẵn thành `previousClass` — CSS class thật, không phải tên
// effect thô, vì effect dùng có thể là `disappearEffect` HOẶC `idleEffect` tuỳ nguồn gốc chuyển cảnh,
// xem bên dưới), "current" = đoạn ĐANG HIỆN TỚI (đang chạy `appearEffect`, class "-in"). `previous ===
// null` = trạng thái đứng yên bình thường, không có gì đang chuyển cảnh.
//
// `viaIdle`: TRUE khi ĐÚNG lượt đổi `text` NÀY là do phase "idle" (Reset, hoặc tự nhiên về Idle) sinh
// ra — ĐỌC TRỰC TIẾP từ `RevealState.phase` của `useRevealed` (component gọi hàm này tự truyền vào,
// xem WinnerNameView.tsx), KHÔNG tự suy luận lại bằng cách so sánh `resetSeq` ở ĐÂY (bản trước làm
// vậy — đã gặp bug thật: `text` chỉ thật sự đổi sau khi effect của `useRevealed` chạy xong, tức có thể
// ở LƯỢT RENDER KHÁC hẳn với lượt `resetSeq` đổi, nên so `resetSeq` tách rời ở 1 hook khác luôn có
// nguy cơ lệch nhịp). Vì `RevealState.phase` LUÔN cập nhật ĐỒNG THỜI với `text` trong CÙNG 1 lần
// setState của `useRevealed`, `viaIdle` tính từ đó không bao giờ lệch nhịp với `text`. Khi `viaIdle`,
// lớp VISUAL "previous" ở đây KHÔNG bắt buộc phải biến mất ngay theo `text` — nó có thể đứng yên (hiện
// nguyên tên cũ) thêm `idleDelayMs` rồi mới chạy hiệu ứng `idleEffect` (khác hẳn
// `disappearEffect`/không delay dùng cho Redraw thường).
export function useRevealTransition(
  text: string,
  appearEffect: WinnerTransitionEffect,
  disappearEffect: WinnerTransitionEffect,
  viaIdle: boolean,
  idleEffect?: WinnerTransitionEffect,
  idleDelayMs?: number
): { current: string; previous: string | null; previousClass: string } {
  const [{ current, previous, previousClass }, setLayers] = useState<{
    current: string;
    previous: string | null;
    previousClass: string;
  }>({ current: text, previous: null, previousClass: "" });
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (text === prevTextRef.current) return;
    const old = prevTextRef.current;
    prevTextRef.current = text;

    const usedDisappearEffect = viaIdle ? idleEffect ?? "none" : disappearEffect;
    const delay = viaIdle ? Math.max(0, idleDelayMs ?? 0) : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function startTransition() {
      // Chỉ CẦN chạy hiệu ứng "-in" khi `text` MỚI thật sự có nội dung (appear vào chuỗi rỗng = không
      // thấy gì, animation vô nghĩa) — vd Idle/Reset luôn có `text=""`, dù `appearEffect` của Draw có
      // cấu hình gì đi nữa cũng không liên quan, không được lấy đó làm lý do giữ lớp "previous" (tên
      // cũ) treo thêm TRANSITION_MS vô ích.
      const showAppear = text !== "" && appearEffect !== "none";
      if (!showAppear && usedDisappearEffect === "none") {
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
  }, [text, appearEffect, disappearEffect, viaIdle, idleEffect, idleDelayMs]);

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
 * nối tiếp qua callback `onDone` của `runStep` (chạy ĐÚNG lúc `setShown(false)` của bước ẩn đã thật
 * sự thực thi), KHÔNG tính lại mốc thời gian rồi đặt 1 setTimeout song song (đã gặp bug thật: 2 timer
 * tính ra CÙNG 1 mốc tuyệt đối đua nhau theo thứ tự nạp event loop — nếu `setShown(false)` chạy SAU
 * `setShown(true)` sẽ đè mất hiệu ứng vừa hiện lại ngay lập tức, trông như "ẩn được nhưng không hiện
 * lại"). `drawEffect.delayMs` đo THÊM từ lúc `onDone` gọi (tức từ lúc `redrawEffect` chạy xong hẳn).
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

    // `onDone` chạy ĐÚNG lúc bước này THẬT SỰ hoàn tất (sau khi setShown/setTransitionClass cuối cùng
    // đã gọi) — dùng để nối bước kế tiếp (Redraw → hiện lại) một cách CHÍNH XÁC, thay vì tính lại thời
    // gian từ bên ngoài (`delay + TRANSITION_MS`) rồi đặt 1 setTimeout SONG SONG: 2 timer tính ra cùng
    // 1 mốc tuyệt đối sẽ ĐUA NHAU theo thứ tự nạp vào event loop, không đảm bảo timer nào chạy trước —
    // nếu setShown(false) (từ bước ẩn) chạy SAU setShown(true) (từ bước hiện) mới đè lên, hiện lại sẽ
    // bị dập tắt ngay lập tức (bug thật đã gặp: Redraw ẩn được nhưng không thấy hiện lại).
    function runStep(toVisible: boolean, step: DrawPhaseEffectConfig | undefined, onDone?: () => void) {
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
            onDone?.();
          } else if (effect !== "none") {
            setTransitionClass(DISAPPEAR_CLASS[effect]);
            timers.push(
              setTimeout(() => {
                setTransitionClass("");
                setShown(false);
                onDone?.();
              }, TRANSITION_MS)
            );
          } else {
            setShown(false);
            onDone?.();
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
      // là 1 hành động chung, không có field riêng cho bước này), CHỈ SAU KHI bước ẩn báo `onDone`.
      if (config.redrawAction === "none") return;
      runStep(restVisible, config.redrawEffect, () => {
        if (config.drawAction === "none") return;
        const inDelay = Math.max(0, config.drawEffect?.delayMs ?? 0);
        timers.push(setTimeout(() => runStep(!restVisible, config.drawEffect), inDelay));
      });
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);

  return { shown, transitionClass };
}
