import { DEFAULT_DRAW_CYCLE, isLiveDrawResultId, LandingData, TextComponent } from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";

export default function TextView({
  component,
  data,
  builderPreview,
  resetSeq,
}: {
  component: TextComponent;
  // `data`/`resetSeq` CHỈ có tác dụng khi `props.syncWithDraw` bật — Text tĩnh (mặc định) không đọc
  // gì từ đây, giữ NGUYÊN hành vi cũ tuyệt đối cho mọi landing đã lưu trước khi có field này.
  data?: LandingData;
  builderPreview?: boolean;
  // DrawSequenceActions.resetSeq — xem doc-comment ở types.ts và useDrawCycleVisibility trong
  // drawRevealHooks.ts.
  resetSeq?: number;
}) {
  const { content, fontSize, color, fontWeight, align, syncWithDraw, drawCycle } = component.props;
  const latest = data?.results[0];
  // Chỉ 1 lượt Draw LIVE (id "pending-*") mới kích hoạt reveal — kết quả cũ từ DB khi mở lại phiên
  // không làm Text tự hiện, xem chú thích tương tự trong WinnerNameView.tsx.
  const liveResultId = isLiveDrawResultId(latest?.id) ? latest!.id : undefined;

  // `drawCycle` chỉ undefined khi CHƯA từng bật `syncWithDraw` — DEFAULT_DRAW_CYCLE không bao giờ
  // thực sự ảnh hưởng gì tới hiển thị trong trường hợp đó (xem `visible` bên dưới).
  const { shown, transitionClass } = useDrawCycleVisibility(liveResultId, drawCycle ?? DEFAULT_DRAW_CYCLE, resetSeq);
  const visible = !syncWithDraw || builderPreview || shown;

  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";

  return (
    <div
      className="relative flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{ fontSize, color, fontWeight, textAlign: align, justifyContent }}
    >
      {visible && (
        <div className={syncWithDraw && !builderPreview ? transitionClass : undefined}>{content}</div>
      )}
    </div>
  );
}
