import {
  BackgroundComponent,
  DEFAULT_BACKGROUND_BLUR_AMOUNT,
  DEFAULT_BACKGROUND_DIM_AMOUNT,
  DEFAULT_DRAW_CYCLE,
  drawCycleResultId,
  LandingData,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";

// Ảnh nền tĩnh — về cơ bản giống ImageView.tsx (cùng dùng `useDrawCycleVisibility`/`transitionClass`
// cho cặp "appear"/"disappear" y hệt Image/Text), chỉ khác ở 2 giá trị Appearance thêm "dim"/"blur" —
// đọc thêm `activeState`/`activeAmount` (Image/Text bỏ qua 2 field này, chỉ dao động appear/disappear)
// để biết vẽ overlay nào. "disappear" = ẩn hẳn (lộ màu đen canvas, chạy transitionClass y hệt Image ẩn
// nội dung); "appear"/"dim"/"blur" đều hiện ảnh — dim/blur chỉ thêm 1 lớp filter LIÊN TỤC (opacity/
// blur tự chuyển mượt qua CSS transition, không cần lớp "-in"/"-out" riêng như trục appear/disappear ở
// trên) đè lên, không ảnh hưởng gì tới bản thân việc ảnh có hiện hay không. Không phủ hết canvas thì
// phần còn lại luôn là màu đen nền của LandingRenderer (component này chỉ vẽ đúng khung
// x/y/width/height của chính nó).
export default function BackgroundView({
  component,
  data,
  builderPreview,
  resetSeq,
}: {
  component: BackgroundComponent;
  data?: LandingData;
  builderPreview?: boolean;
  resetSeq?: number;
}) {
  const { srcDataUrl, fit, syncWithDraw, drawCycle } = component.props;
  const latest = data?.results[0];
  // Lọc theo Prize đã gán (nếu có) + chỉ lượt LIVE — xem drawCycleResultId trong types.ts.
  const liveResultId = drawCycleResultId(latest, drawCycle);

  // builderPreview (canvas Builder) LUÔN hiện "sạch" (appear) để còn thấy mà chọn/kéo/resize — giống
  // Text/Image. Không bật syncWithDraw thì cũng không có gì để active.
  const { shown, transitionClass, activeState, activeAmount } = useDrawCycleVisibility(
    !syncWithDraw || builderPreview ? undefined : liveResultId,
    drawCycle ?? DEFAULT_DRAW_CYCLE,
    resetSeq
  );
  // Tắt sync hoặc đang ở Builder canvas → LUÔN hiện "sạch" (appear), bỏ qua shown/activeState suy ra
  // từ resultId=undefined (vốn sẽ tính ra "disappear" nếu đọc thẳng DEFAULT_DRAW_CYCLE.idleState) —
  // giống hệt pattern `visible = !syncWithDraw || builderPreview || shown` của Image/Text.
  const effectiveShown = !syncWithDraw || builderPreview || shown;
  const effectiveState = !syncWithDraw || builderPreview ? "appear" : activeState;

  const dimOpacity = effectiveState === "dim" ? (activeAmount ?? DEFAULT_BACKGROUND_DIM_AMOUNT) / 100 : 0;
  const blurPx = effectiveState === "blur" ? (activeAmount ?? DEFAULT_BACKGROUND_BLUR_AMOUNT) : 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {effectiveShown && (
        <div className={`absolute inset-0 ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
          {srcDataUrl ? (
            <img
              src={srcDataUrl}
              alt=""
              className="h-full w-full"
              style={{
                objectFit: fit === "stretch" ? "fill" : fit,
                filter: `blur(${blurPx}px)`,
                transition: "filter 500ms ease",
              }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-base-500">No image</span>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{ opacity: dimOpacity, transition: "opacity 500ms ease" }}
          />
        </div>
      )}
    </div>
  );
}
