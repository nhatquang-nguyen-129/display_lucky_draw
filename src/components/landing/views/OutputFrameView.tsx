import { OutputFrameComponent, resolveFrameMaskOptions } from "@/lib/landing/types";
import { useFrameMask } from "@/lib/landing/frameMask";

interface OutputFrameViewProps {
  component: OutputFrameComponent;
  builderPreview?: boolean;
}

// Khung nét đứt vàng = vùng LED controller/Resolume cắt ra (xem OutputFrameProps trong types.ts).
// Vẽ bằng SVG `vector-effect: non-scaling-stroke` — nét LUÔN đúng 1px màn hình bất kể LandingRenderer
// đang scale bao nhiêu (Builder zoom, Present fit cửa sổ), chỉ vừa đủ nhìn. Rect lùi vào 0.5px để nét
// nằm TRONG khung (gọn trong vùng bị cắt). Builder luôn hiện + nhãn toạ độ cắt; Present Mode/preview cửa
// sổ chính chỉ hiện khi bật `showInPresent`.
// Shape "image": thay khung chữ nhật bằng viền bám đúng hình vùng LED trong file pixel map PNG
// (frameMask.ts).
export default function OutputFrameView({ component, builderPreview }: OutputFrameViewProps) {
  const { props } = component;
  const isImage = props.shape === "image" && !!props.maskSrc;
  const mask = useFrameMask(isImage ? props.maskSrc : null, resolveFrameMaskOptions(props));
  if (!builderPreview && !props.showInPresent) return null;

  const dashedRect = (
    <svg className="absolute inset-0 h-full w-full overflow-visible">
      <rect
        x={0.5}
        y={0.5}
        width={Math.max(0, component.width - 1)}
        height={Math.max(0, component.height - 1)}
        fill="none"
        stroke="#FFCA2D"
        strokeWidth={1}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  return (
    <div className="relative h-full w-full">
      {isImage && builderPreview && (props.maskImageOpacity ?? 0) > 0 && (
        <img
          src={props.maskSrc!}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full"
          style={{ opacity: (props.maskImageOpacity ?? 0) / 100 }}
        />
      )}
      {isImage && mask.result ? (
        <img src={mask.result.outlineUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      ) : (
        // Rectangle, hoặc Image chưa xử lý xong/lỗi — vẫn hiện khung chữ nhật để không "mất" khung.
        dashedRect
      )}
      {builderPreview && (
        <div
          className="relative inline-block whitespace-nowrap bg-highlight-500 font-medium text-black"
          style={{ fontSize: 20, padding: "2px 10px" }}
        >
          LED {props.targetWidth}×{props.targetHeight} · crop X {Math.round(component.x)} Y {Math.round(component.y)} ·{" "}
          {Math.round(component.width)}×{Math.round(component.height)}
          {props.shape === "image" && !props.maskSrc && " · import a mapping PNG"}
          {mask.error && " · cannot read mapping image"}
        </div>
      )}
    </div>
  );
}
