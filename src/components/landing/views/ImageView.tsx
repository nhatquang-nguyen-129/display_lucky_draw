import {
  DEFAULT_BACKGROUND_BLUR_AMOUNT,
  DEFAULT_BACKGROUND_DIM_AMOUNT,
  DEFAULT_DRAW_CYCLE,
  drawCycleResultId,
  ImageComponent,
  LandingData,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";

export default function ImageView({
  component,
  data,
  builderPreview,
  resetSeq,
}: {
  component: ImageComponent;
  // 3 prop dưới CHỈ có tác dụng khi `props.syncWithDraw` bật — Image tĩnh (mặc định) không đọc gì từ
  // đây, giữ NGUYÊN hành vi cũ tuyệt đối cho mọi landing đã lưu trước khi có field này.
  data?: LandingData;
  builderPreview?: boolean;
  // DrawSequenceActions.resetSeq — xem doc-comment ở types.ts và useDrawCycleVisibility trong
  // drawRevealHooks.ts.
  resetSeq?: number;
}) {
  const { srcDataUrl, fit, borderRadius, syncWithDraw, drawCycle } = component.props;
  const latest = data?.results[0];
  // Lọc theo Prize đã gán (nếu có) + chỉ lượt LIVE — xem drawCycleResultId trong types.ts.
  const liveResultId = drawCycleResultId(latest, drawCycle);

  // `drawCycle` chỉ undefined khi CHƯA từng bật `syncWithDraw` — DEFAULT_DRAW_CYCLE không bao giờ
  // thực sự ảnh hưởng gì tới hiển thị trong trường hợp đó (xem `visible`/`showFrame` bên dưới).
  const { shown, transitionClass, activeState, activeAmount } = useDrawCycleVisibility(
    liveResultId,
    drawCycle ?? DEFAULT_DRAW_CYCLE,
    resetSeq
  );
  // builderPreview (canvas Builder) LUÔN hiện tĩnh để còn thấy mà chọn/kéo/resize — giống Text/Winner
  // Name. Không bật syncWithDraw thì giữ NGUYÊN hành vi cũ (luôn hiện).
  const visible = !syncWithDraw || builderPreview || shown;
  const showFrame = !syncWithDraw || builderPreview || shown;

  // Dim/Blur — cùng 4 giá trị Appearance với BackgroundView.tsx nhưng KHÁC cách vẽ: Image thường là
  // PNG có nền trong suốt (vd Podium), 1 lớp phủ đen như Background sẽ tô đen cả phần trong suốt thành
  // 1 khung chữ nhật — nên dùng CSS filter brightness()/blur() thẳng lên <img>, chỉ tác động phần có
  // pixel thật. brightness(1 - dim%) cho ra ĐÚNG màu của lớp phủ đen opacity dim% ở phần ảnh đặc.
  const effectiveState = !syncWithDraw || builderPreview ? "appear" : activeState;
  const brightness = effectiveState === "dim" ? 1 - (activeAmount ?? DEFAULT_BACKGROUND_DIM_AMOUNT) / 100 : 1;
  const blurPx = effectiveState === "blur" ? (activeAmount ?? DEFAULT_BACKGROUND_BLUR_AMOUNT) : 0;

  function renderImg() {
    return srcDataUrl ? (
      <img
        src={srcDataUrl}
        alt=""
        className="h-full w-full"
        style={{
          objectFit: fit === "stretch" ? "fill" : fit,
          borderRadius,
          filter: `brightness(${brightness}) blur(${blurPx}px)`,
          transition: "filter 500ms ease",
        }}
      />
    ) : (
      <span className="text-xs text-base-500">No image</span>
    );
  }

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${showFrame ? "bg-base-800/40" : ""}`}
      style={{ borderRadius }}
    >
      {visible && (
        <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>{renderImg()}</div>
      )}
    </div>
  );
}
