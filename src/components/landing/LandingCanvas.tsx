import { useEffect, useRef, useState } from "react";
import { LandingComponent, LandingComponentType, LandingConfig, LandingData } from "@/lib/landing/types";
import LandingRenderer from "./LandingRenderer";
import LandingRulers, { RULER_SIZE } from "./LandingRulers";

export const DRAG_MIME = "application/x-landing-component";
const MIN_SIZE = 20;

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type CanvasTool = "select" | "hand";

interface LandingCanvasProps {
  config: LandingConfig;
  data?: LandingData;
  selectedId: string | null;
  showGrid?: boolean;
  tool?: CanvasTool;
  zoom?: number; // hệ số phóng to trên nền tỉ lệ "vừa khung" — 1 = vừa khung (mức zoom out tối đa)
  onSelect: (id: string | null) => void;
  onUpdateComponent: (id: string, patch: Partial<LandingComponent>) => void;
  onDropNewComponent: (type: LandingComponentType, x: number, y: number) => void;
}

const GRID_SIZE = 40; // px, đo trong không gian artboard (chưa scale) — chỉ để căn chỉnh mắt, không snap
const CENTER_SNAP_PX = 8; // ngưỡng bắt dính vào đường tâm canvas, tính theo px màn hình (không phải artboard)

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

// Bề mặt tương tác của Builder — vẽ nền bằng chính LandingRenderer (đảm bảo không bao giờ lệch
// với Present Mode), rồi phủ lên 1 lớp overlay cùng tỉ lệ scale để xử lý chọn/kéo-di-chuyển/
// kéo-thay-đổi-kích-thước + nhận thả từ Palette. Toàn bộ math kéo-thả dùng chung 1 kiểu với
// column-resize trong DataEditorModal (mousedown → gắn mousemove/mouseup ở window, tính delta từ
// điểm bắt đầu), chỉ khác là mở rộng ra 2 trục và phải chia cho `scale` vì canvas được scale hình ảnh.
export default function LandingCanvas({
  config,
  data,
  selectedId,
  showGrid,
  tool = "select",
  zoom = 1,
  onSelect,
  onUpdateComponent,
  onDropNewComponent,
}: LandingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  // fitScale = tỉ lệ để cả artboard vừa khít khung nhìn hiện tại — đây là mốc "zoom out tối đa"
  // (zoom = 1). scale thực tế hiển thị/dùng để tính toán toạ độ = fitScale * zoom.
  const [fitScale, setFitScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 }); // kích thước vùng canvas (đã trừ thước) — dùng để vẽ ruler
  const availRef = useRef({ w: 0, h: 0 }); // bản sao đọc nhanh của avail, dùng trong closure kéo-thả
  const [centerGuides, setCenterGuides] = useState({ x: false, y: false }); // đang bắt dính đường tâm ngang/dọc
  const { width: canvasWidth, height: canvasHeight } = config.canvas;
  const scale = fitScale * zoom;

  // Giới hạn pan sao cho artboard luôn phủ kín khung nhìn — không cho kéo lộ khoảng trống ở rìa,
  // và không cho kéo trôi mất cả landing ra khỏi màn hình. Ở đúng mức zoom vừa khung (artboard <=
  // khung nhìn ở 1 trục), biên độ cho phép ở trục đó là 0 (khoá pan hẳn), đúng như lúc zoom out tối đa.
  function clampPan(next: { x: number; y: number }, atScale: number) {
    const artboardW = canvasWidth * atScale;
    const artboardH = canvasHeight * atScale;
    const maxX = Math.max(0, (artboardW - availRef.current.w) / 2);
    const maxY = Math.max(0, (artboardH - availRef.current.h) / 2);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const compute = () => {
      // Trừ RULER_SIZE vì thước ngang/dọc chiếm 1 dải cố định ở rìa trên/trái — vùng còn lại mới
      // là nơi artboard thực sự được vẽ và scale-to-fit.
      const availW = wrapper.clientWidth - RULER_SIZE;
      const availH = wrapper.clientHeight - RULER_SIZE;
      if (availW <= 0 || availH <= 0) return;
      availRef.current = { w: availW, h: availH };
      setAvail({ w: availW, h: availH });
      setFitScale(Math.min(availW / canvasWidth, availH / canvasHeight));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  // Zoom hoặc kích thước cửa sổ đổi → biên độ pan hợp lệ cũng đổi theo, kẹp lại pan hiện tại
  // ngay để không bị kẹt ở trạng thái "trôi ra ngoài" sau khi zoom out hoặc thu nhỏ cửa sổ.
  useEffect(() => {
    setPan((p) => clampPan(p, scale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, canvasWidth, canvasHeight]);

  function handleComponentMouseDown(e: React.MouseEvent, component: LandingComponent) {
    e.stopPropagation();
    onSelect(component.id);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = component.x;
    const startY = component.y;

    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;
      let nextX = clamp(startX + dx, 0, canvasWidth - component.width);
      let nextY = clamp(startY + dy, 0, canvasHeight - component.height);

      // Bắt dính vào đường tâm ngang/dọc của canvas — ngưỡng tính theo px MÀN HÌNH (chia cho
      // scale để ra ngưỡng tương ứng trong không gian artboard) để cảm giác bắt dính không đổi
      // theo mức zoom. Chỉ áp dụng cho di chuyển, không áp dụng khi resize.
      const threshold = CENTER_SNAP_PX / scale;
      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      const objCenterX = nextX + component.width / 2;
      const objCenterY = nextY + component.height / 2;
      const snapX = Math.abs(objCenterX - centerX) < threshold;
      const snapY = Math.abs(objCenterY - centerY) < threshold;
      if (snapX) nextX = centerX - component.width / 2;
      if (snapY) nextY = centerY - component.height / 2;
      setCenterGuides({ x: snapX, y: snapY });

      onUpdateComponent(component.id, { x: nextX, y: nextY });
    }
    function onUp() {
      setCenterGuides({ x: false, y: false });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleResizeMouseDown(e: React.MouseEvent, component: LandingComponent, corner: ResizeCorner) {
    e.stopPropagation();
    e.preventDefault();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const start = { x: component.x, y: component.y, width: component.width, height: component.height };

    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;
      let { x, y, width, height } = start;
      if (corner.includes("right")) width = Math.max(MIN_SIZE, start.width + dx);
      if (corner.includes("left")) {
        width = Math.max(MIN_SIZE, start.width - dx);
        x = start.x + (start.width - width);
      }
      if (corner.includes("bottom")) height = Math.max(MIN_SIZE, start.height + dy);
      if (corner.includes("top")) {
        height = Math.max(MIN_SIZE, start.height - dy);
        y = start.y + (start.height - height);
      }
      x = clamp(x, 0, canvasWidth - width);
      y = clamp(y, 0, canvasHeight - height);
      onUpdateComponent(component.id, { x, y, width, height });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Hand tool (phím tắt H) — giữ chuột để kéo khung nhìn, giống Photoshop. Pan hoạt động trên
  // toạ độ MÀN HÌNH (không chia cho `scale`) vì đang dịch chuyển cả khung nhìn, không phải 1 object
  // trong không gian artboard; kẹp trong lúc kéo (không đợi thả chuột) để không hở khoảng trống ở
  // rìa hay trôi mất landing. getBoundingClientRect() dùng ở handleDrop/handleComponentMouseDown tự
  // phản ánh đúng vị trí trên màn hình dù artboard đã bị pan, nên không cần sửa gì thêm ở các hàm đó.
  function handleWrapperMouseDown(e: React.MouseEvent) {
    if (tool !== "hand") return;
    e.preventDefault();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPan = pan;
    setIsPanning(true);

    function onMove(ev: MouseEvent) {
      setPan(
        clampPan(
          { x: startPan.x + (ev.clientX - startClientX), y: startPan.y + (ev.clientY - startClientY) },
          scale
        )
      );
    }
    function onUp() {
      setIsPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData(DRAG_MIME) as LandingComponentType | "";
    if (!type || !artboardRef.current) return;
    const rect = artboardRef.current.getBoundingClientRect();
    const dropX = (e.clientX - rect.left) / scale;
    const dropY = (e.clientY - rect.top) / scale;
    onDropNewComponent(type, dropX, dropY);
  }

  const corners: ResizeCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const cornerCursor: Record<ResizeCorner, string> = {
    "top-left": "nwse-resize",
    "bottom-right": "nwse-resize",
    "top-right": "nesw-resize",
    "bottom-left": "nesw-resize",
  };
  const selectedComponent = config.components.find((c) => c.id === selectedId) ?? null;

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden bg-base-950">
      <LandingRulers
        scale={scale}
        pan={pan}
        avail={avail}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        selection={selectedComponent}
      />

      {/* Vùng canvas thực — trừ đúng phần bị 2 thanh thước chiếm ở rìa trên/trái. */}
      <div
        className={`absolute flex items-center justify-center overflow-hidden ${
          tool === "hand" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ left: RULER_SIZE, top: RULER_SIZE, right: 0, bottom: 0 }}
        onClick={() => onSelect(null)}
        onMouseDown={handleWrapperMouseDown}
        onDoubleClick={() => tool === "hand" && setPan({ x: 0, y: 0 })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          ref={artboardRef}
          className="relative shadow-2xl"
          style={{
            width: canvasWidth * scale,
            height: canvasHeight * scale,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <LandingRenderer config={config} data={data} scale={scale} />

          {/* Lưới căn chỉnh — chỉ để mắt nhìn theo cho dễ, KHÔNG snap toạ độ vào lưới. Nền mặc định
              của landing là trắng nên lưới dùng màu đen để luôn rõ, không phụ thuộc màu nền đã chọn. */}
          {showGrid && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px)",
                backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
              }}
            />
          )}

          {/* Đường dóng đỏ báo đang bắt dính vào tâm canvas — giống Photoshop/Figma smart guide,
              chỉ hiện trong lúc kéo di chuyển, biến mất ngay khi thả chuột hoặc lệch khỏi ngưỡng. */}
          {centerGuides.x && (
            <div className="pointer-events-none absolute top-0 h-full w-px bg-danger-500" style={{ left: (canvasWidth / 2) * scale }} />
          )}
          {centerGuides.y && (
            <div className="pointer-events-none absolute left-0 w-full h-px bg-danger-500" style={{ top: (canvasHeight / 2) * scale }} />
          )}

          {/* Overlay tương tác — cùng toạ độ/scale với artboard bên dưới, chỉ vẽ viền/handle, không che nội dung.
              Tắt hẳn pointer-events khi đang dùng Hand tool để mousedown luôn rơi xuống wrapper (pan),
              không bị component "chặn" ở giữa đường. Lọc bỏ component có hiddenInBuilder (bật/tắt qua
              LayersPanel.tsx) khỏi khung chọn/kéo-thả — không thì dù LandingRenderer đã ẩn phần vẽ,
              khung tương tác vô hình ở đây vẫn còn nguyên, vẫn chặn click của component khác nằm
              dưới/cạnh nó. SẮP XẾP theo zIndex TĂNG DẦN giống hệt LandingRenderer.tsx (component
              zIndex cao hơn = vẽ sau = nằm cuối DOM = bắt click trước) — thiếu bước sắp xếp này thì
              thứ tự bắt click (theo thứ tự MẢNG gốc, tức thứ tự TẠO component) sẽ lệch khỏi thứ tự
              hiển thị thật (theo zIndex, đổi được qua kéo-thả trong Layers panel): 1 component to
              phủ cả canvas (vd Fireworks mặc định 1920x1080) nếu rơi vào tình huống này sẽ vô tình
              chặn click của MỌI component khác dù đang nằm dưới nó về mặt hiển thị. */}
          <div className={tool === "hand" ? "pointer-events-none" : ""}>
            {[...config.components]
              .filter((c) => !c.hiddenInBuilder)
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((component) => {
                const isSelected = component.id === selectedId;
                return (
                  <div
                    key={component.id}
                    onMouseDown={(e) => handleComponentMouseDown(e, component)}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute cursor-move ${isSelected ? "outline outline-2 outline-gold-500" : "hover:outline hover:outline-1 hover:outline-gold-500/50"}`}
                    style={{
                      left: component.x * scale,
                      top: component.y * scale,
                      width: component.width * scale,
                      height: component.height * scale,
                    }}
                  >
                    {isSelected &&
                      corners.map((corner) => (
                        <div
                          key={corner}
                          onMouseDown={(e) => handleResizeMouseDown(e, component, corner)}
                          className="absolute h-2.5 w-2.5 rounded-full border border-base-950 bg-gold-500"
                          style={{
                            cursor: cornerCursor[corner],
                            top: corner.includes("top") ? -5 : undefined,
                            bottom: corner.includes("bottom") ? -5 : undefined,
                            left: corner.includes("left") ? -5 : undefined,
                            right: corner.includes("right") ? -5 : undefined,
                          }}
                        />
                      ))}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
