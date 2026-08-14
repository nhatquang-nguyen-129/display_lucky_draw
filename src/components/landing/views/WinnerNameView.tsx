import { useEffect, useRef, useState } from "react";
import { LandingData, WinnerNameComponent, WinnerTransitionEffect } from "@/lib/landing/types";

// CHỈ trong canvas kéo-thả của Landing Builder (xem `builderPreview` — bắt nguồn từ `clip={false}`,
// tín hiệu riêng LandingCanvas.tsx đã dùng sẵn để tự nhận diện, xem LandingRenderer.tsx) — hiện chữ
// này thay vì fallbackText thật của component (thường chỉ "—", nhìn qua rất khó biết đây là khung
// Winner Name để chọn/sửa). LandingPage.tsx (preview read-only ở cửa sổ chính) và Present Mode thật
// PHẢI giữ nguyên fallbackText/tên người trúng thật — 2 nơi đó không truyền `builderPreview`, dù bản
// thân chúng cũng không "interactive" giống LandingPage.tsx, nên KHÔNG được gộp chung với cờ đó.
const BUILDER_PLACEHOLDER = "Winner Name";

// Phải khớp đúng 0.5s khai báo cho các class winner-transition-*-in/out trong landingEffects.css —
// đổi 1 trong 2 chỗ thì phải đổi luôn chỗ còn lại.
const TRANSITION_MS = 500;

const TRANSITION_OUT_CLASS: Record<WinnerTransitionEffect, string> = {
  none: "",
  crossfade: "winner-transition-crossfade-out",
  slideUp: "winner-transition-slideUp-out",
  slideDown: "winner-transition-slideDown-out",
  zoom: "winner-transition-zoom-out",
};
const TRANSITION_IN_CLASS: Record<WinnerTransitionEffect, string> = {
  none: "",
  crossfade: "winner-transition-crossfade-in",
  slideUp: "winner-transition-slideUp-in",
  slideDown: "winner-transition-slideDown-in",
  zoom: "winner-transition-zoom-in",
};

export default function WinnerNameView({
  component,
  data,
  builderPreview,
  revealDelayMs = 0,
}: {
  component: WinnerNameComponent;
  data?: LandingData;
  builderPreview?: boolean;
  // Chờ đúng bằng thời lượng Lucky Wheel trên trang quay xong hẳn (xem computeWheelRevealDelayMs
  // trong types.ts) rồi mới hiện tên thật — 0 nếu trang không có Wheel nào (hiện ngay). LandingRenderer.tsx
  // remount HẲN component này mỗi khi results[0].id đổi (xem REMOUNT_ON_RESULT_TYPES), nên state ở
  // đây luôn bắt đầu lại từ đầu đúng lúc có candidate mới — không cần tự so sánh id ở đây.
  revealDelayMs?: number;
}) {
  const { fontSize, color, fontWeight, align, fallbackText, revealEffect, transitionEffect } = component.props;
  const latest = data?.results[0];

  const [revealed, setRevealed] = useState(revealDelayMs <= 0);
  useEffect(() => {
    if (revealDelayMs <= 0) return;
    const timer = setTimeout(() => setRevealed(true), revealDelayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRevealed = !builderPreview && !!latest && revealed;
  const text = builderPreview ? BUILDER_PLACEHOLDER : isRevealed ? latest!.participant_name : fallbackText;
  const effect = transitionEffect ?? "none";

  // "current"/"previous" — 2 lớp text CHỒNG LÊN NHAU trong lúc chuyển cảnh (transitionEffect):
  // "previous" = đoạn VỪA MẤT ĐI (đang chạy animation "-out"), "current" = đoạn ĐANG HIỆN TỚI (đang
  // chạy animation "-in"). `previous === null` = trạng thái đứng yên bình thường — không có gì đang
  // chuyển cảnh, chỉ 1 lớp "current" hiện, dùng revealEffect (hiệu ứng đứng yên/xuất hiện, KHÁC hẳn
  // transitionEffect — xem types.ts). transitionEffect = "none" thì bỏ qua hẳn cơ chế 2 lớp, luôn chỉ
  // đổi tức thì — giữ ĐÚNG hành vi revealEffect cũ (áp cho MỌI đoạn text đang hiện, kể cả fallback).
  const [{ current, previous }, setLayers] = useState<{ current: string; previous: string | null }>({
    current: text,
    previous: null,
  });
  const prevTextRef = useRef(text);
  useEffect(() => {
    if (text === prevTextRef.current) return;
    const old = prevTextRef.current;
    prevTextRef.current = text;
    if (effect === "none") {
      setLayers({ current: text, previous: null });
      return;
    }
    setLayers({ current: text, previous: old });
    const timer = setTimeout(() => setLayers((s) => ({ current: s.current, previous: null })), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [text, effect]);

  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const transitioning = previous !== null;
  // `key` đổi đúng 1 lần khi fallbackText được thay bằng tên thật — buộc React remount lớp "current",
  // tự phát lại revealEffect ĐÚNG lúc đó khi KHÔNG đang transitioning (transitionEffect = "none" hoặc
  // đã transition xong). Trong lúc đang transitioning, lớp này hiện với class transition "-in" thay
  // vì revealEffect — 2 hiệu ứng cùng đụng `transform` sẽ đè nhau nếu áp đồng thời.
  const layerKey = isRevealed ? "revealed" : "pending";

  return (
    <div
      className="relative flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{ fontSize, color, fontWeight, textAlign: align, justifyContent }}
    >
      {transitioning && (
        <span
          className={`absolute inset-0 flex items-center ${TRANSITION_OUT_CLASS[effect]}`}
          style={{ justifyContent }}
        >
          {previous}
        </span>
      )}
      <span
        key={layerKey}
        className={
          transitioning
            ? `absolute inset-0 flex items-center ${TRANSITION_IN_CLASS[effect]}`
            : `inline-block landing-effect-${revealEffect}`
        }
        style={transitioning ? { justifyContent } : undefined}
      >
        {current}
      </span>
    </div>
  );
}
