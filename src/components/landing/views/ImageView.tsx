import { DEFAULT_DRAW_CYCLE, ImageComponent, isLiveDrawResultId, LandingData } from "@/lib/landing/types";
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
  // Chỉ 1 lượt Draw LIVE (id "pending-*") mới tính là 1 mốc Draw/Redraw thật — kết quả cũ từ DB khi
  // mở lại phiên không tự kích hoạt gì, xem chú thích tương tự trong WinnerNameView.tsx.
  const liveResultId = isLiveDrawResultId(latest?.id) ? latest!.id : undefined;

  // `drawCycle` chỉ undefined khi CHƯA từng bật `syncWithDraw` — DEFAULT_DRAW_CYCLE không bao giờ
  // thực sự ảnh hưởng gì tới hiển thị trong trường hợp đó (xem `visible`/`showFrame` bên dưới).
  const { shown, transitionClass } = useDrawCycleVisibility(liveResultId, drawCycle ?? DEFAULT_DRAW_CYCLE, resetSeq);
  // builderPreview (canvas Builder) LUÔN hiện tĩnh để còn thấy mà chọn/kéo/resize — giống Text/Winner
  // Name. Không bật syncWithDraw thì giữ NGUYÊN hành vi cũ (luôn hiện).
  const visible = !syncWithDraw || builderPreview || shown;
  const showFrame = !syncWithDraw || builderPreview || shown;

  function renderImg() {
    return srcDataUrl ? (
      <img
        src={srcDataUrl}
        alt=""
        className="h-full w-full"
        style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }}
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
