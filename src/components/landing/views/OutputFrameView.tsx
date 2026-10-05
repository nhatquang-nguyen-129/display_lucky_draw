import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_FRAME_DIM_OPACITY,
  OutputFrameComponent,
  resolveFrameMaskOptions,
} from "@/lib/landing/types";
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
// (frameMask.ts), tuỳ chọn làm tối phần canvas ngoài vùng LED.
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
      {isImage && props.dimOutside && <DimOutside component={component} outsideUrl={mask.result?.outsideUrl} />}
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

const OVERLAP_PX = 1;

// Làm tối phần ngoài vùng LED: trong khung = ảnh outsideUrl (đen ở chỗ không có LED), ngoài khung = 4
// dải đen phủ phần còn lại của canvas (giới hạn trong canvas, không tràn ra bàn nháp của Builder).
// Cả cụm chung 1 opacity để mép trong/ngoài khung liền nhau.
function DimOutside({ component, outsideUrl }: { component: OutputFrameComponent; outsideUrl?: string }) {
  const { x, y, width, height } = component;
  const opacity = (component.props.dimOpacity ?? DEFAULT_FRAME_DIM_OPACITY) / 100;
  const band = (left: number, top: number, w: number, h: number, key: string) =>
    w > 0 && h > 0 ? <div key={key} className="absolute bg-black" style={{ left, top, width: w, height: h }} /> : null;
  // Toạ độ tương đối với khung component (gốc = góc trên-trái khung), cắt theo canvas.
  const left = -x;
  const top = -y;
  const right = CANVAS_WIDTH - x;
  const bottom = CANVAS_HEIGHT - y;
  const midTop = Math.max(top, 0);
  const midBottom = Math.min(bottom, height);
  // Dải ngoài lấn vào trong khung OVERLAP px: mép dải và mép ảnh outsideUrl cùng khử răng cưa ở 1 pixel
  // màn hình lẻ thì cộng lại không đủ đặc → lộ 1 đường sáng mảnh. Phần lấn nằm dưới viền vàng (dày hơn).
  const o = OVERLAP_PX;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity }}>
      {band(left, top, right - left, Math.max(0, Math.min(bottom, o) - top), "top")}
      {band(left, Math.max(height - o, top), right - left, bottom - Math.max(height - o, top), "bottom")}
      {band(left, midTop, Math.min(o, right) - left, midBottom - midTop, "left")}
      {band(Math.max(width - o, left), midTop, right - Math.max(width - o, left), midBottom - midTop, "right")}
      {outsideUrl && (
        <img src={outsideUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}
