import { OutputFrameComponent } from "@/lib/landing/types";

interface OutputFrameViewProps {
  component: OutputFrameComponent;
  builderPreview?: boolean;
}

// Khung nét đứt vàng = vùng LED controller/Resolume cắt ra (xem OutputFrameProps trong types.ts).
// Vẽ bằng SVG `vector-effect: non-scaling-stroke` — nét LUÔN đúng 1px màn hình bất kể LandingRenderer
// đang scale bao nhiêu (Builder zoom, Present fit cửa sổ), chỉ vừa đủ nhìn. Rect lùi vào 0.5px để nét
// nằm TRONG khung (gọn trong vùng bị cắt). Builder luôn hiện + nhãn toạ độ cắt; Present Mode/preview cửa
// sổ chính chỉ hiện khi bật `showInPresent`.
export default function OutputFrameView({ component, builderPreview }: OutputFrameViewProps) {
  const { props } = component;
  if (!builderPreview && !props.showInPresent) return null;
  return (
    <div className="relative h-full w-full">
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
      {builderPreview && (
        <div
          className="relative inline-block whitespace-nowrap bg-highlight-500 font-medium text-black"
          style={{ fontSize: 20, padding: "2px 10px" }}
        >
          LED {props.targetWidth}×{props.targetHeight} · crop X {Math.round(component.x)} Y {Math.round(component.y)} ·{" "}
          {Math.round(component.width)}×{Math.round(component.height)}
        </div>
      )}
    </div>
  );
}
