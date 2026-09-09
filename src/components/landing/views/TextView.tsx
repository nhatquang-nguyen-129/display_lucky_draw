import { LandingData, TextComponent } from "@/lib/landing/types";
import { APPEAR_CLASS, DISAPPEAR_CLASS, useRevealed, useRevealTransition } from "./drawRevealHooks";

export default function TextView({
  component,
  data,
  builderPreview,
  revealDelayMs = 0,
}: {
  component: TextComponent;
  // 3 prop dưới CHỈ có tác dụng khi `props.syncWithDraw` bật — Text tĩnh (mặc định) không đọc gì từ
  // đây, giữ NGUYÊN hành vi cũ tuyệt đối cho mọi landing đã lưu trước khi có field này.
  data?: LandingData;
  builderPreview?: boolean;
  revealDelayMs?: number;
}) {
  const { content, fontSize, color, fontWeight, align, syncWithDraw, appearEffect, disappearEffect } = component.props;
  const latest = data?.results[0];

  // Hook LUÔN được gọi (kể cả khi syncWithDraw tắt) — tuân thủ Rules of Hooks, chỉ giá trị TRẢ VỀ có
  // được dùng hay không mới tuỳ nhánh bên dưới.
  const revealed = useRevealed(latest?.id, revealDelayMs);
  const text = !syncWithDraw || builderPreview ? content : revealed ? content : "";
  const { current, previous } = useRevealTransition(text, appearEffect ?? "none", disappearEffect ?? "none");

  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const transitioning = syncWithDraw && !builderPreview && previous !== null;

  return (
    <div
      className="relative flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{ fontSize, color, fontWeight, textAlign: align, justifyContent }}
    >
      {transitioning && (
        <span
          className={`absolute inset-0 flex items-center ${DISAPPEAR_CLASS[disappearEffect ?? "none"]}`}
          style={{ justifyContent }}
        >
          {previous}
        </span>
      )}
      <span
        key={current}
        className={transitioning ? `absolute inset-0 flex items-center ${APPEAR_CLASS[appearEffect ?? "none"]}` : "inline-block"}
        style={transitioning ? { justifyContent } : undefined}
      >
        {current}
      </span>
    </div>
  );
}
