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
  selectedIds: string[];
  showGrid?: boolean;
  tool?: CanvasTool;
  zoom?: number; // hệ số phóng to trên nền tỉ lệ "vừa khung" — 1 = vừa khung (mức zoom out tối đa)
  // Cuộn chuột/trackpad muốn đổi zoom nhưng biên độ hợp lệ (MIN_ZOOM/MAX_ZOOM) do component cha quản
  // lý cùng zoom state — nhận vào 1 updater (giống setState functional) để cha tự áp — xem
  // LandingBuilderWindow.tsx.
  onZoomChange?: (updater: (z: number) => number) => void;
  onSelect: (id: string | null) => void;
  // Ctrl (Windows)/Cmd (macOS) + click 1 component — cộng vào vùng chọn nếu chưa có, trừ ra nếu đã có.
  onToggleSelect: (id: string) => void;
  // Kéo-thả xong khung marquee trên nền trống — `additive` = có giữ Ctrl/Cmd lúc BẮT ĐẦU kéo hay
  // không (true = hợp vào selection cũ, false = thay thế hẳn).
  onMarqueeSelect: (ids: string[], additive: boolean) => void;
  onUpdateComponent: (id: string, patch: Partial<LandingComponent>) => void;
  onDropNewComponent: (type: LandingComponentType, x: number, y: number) => void;
}

const GRID_SIZE = 40; // px, đo trong không gian artboard (chưa scale) — chỉ để căn chỉnh mắt, không snap
const CENTER_SNAP_PX = 8; // ngưỡng bắt dính căn thẳng hàng/khoảng cách đều (xem computeSnap()), tính theo px màn hình (không phải artboard)
const MINIMAP_WIDTH = 160; // px hiển thị — chiều cao tự suy ra theo đúng tỉ lệ khung thật (xem minimapScale)
// Tỉ lệ phần "bàn nháp" (pasteboard) mở rộng thêm quanh khung 1920x1080 thật — mỗi bên (trái/phải/
// trên/dưới) thêm 50% kích thước tương ứng của khung thật (marginX/marginY bên dưới), tức tổng
// diện tích bàn nháp = khung thật x2 mỗi trục — với canvas mặc định 1920x1080 thì đúng bằng khung
// 3840x2160 (4K) bao quanh, khung thật nằm giữa. Chỗ này để đặt component NGOÀI khung hiển thị thật
// — chuẩn bị cho hiệu ứng "xuất hiện từ ngoài khung vào trong" sau này (chưa làm ở bản này). An toàn
// tuyệt đối cho Present Mode: LandingRenderer.tsx tự clip đúng khung width/height thật
// (`overflow-hidden`, dùng CHUNG bởi cả Builder lẫn PresentMode.tsx) nên bất kỳ gì nằm ngoài khung
// không bao giờ lọt vào buổi trình chiếu thật, dù không sửa gì ở đó. Dùng TỈ LỆ (không phải số px cố
// định) để luôn hợp lý nếu sau này đổi kích thước canvas.
const PASTEBOARD_MARGIN_RATIO = 0.5;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Đường dóng (đỏ) — khi kéo, 1 trong 3 điểm mốc (mép trái/tâm/mép phải cho trục X, mép trên/tâm/mép
// dưới cho trục Y) của component đang kéo trùng 1 điểm mốc tương ứng của component KHÁC hoặc tâm
// canvas. `pos` là toạ độ ARTBOARD-LOCAL (chưa nhân scale — nhân lúc render, xem JSX bên dưới).
interface GuideLine {
  axis: "x" | "y";
  pos: number;
}

// Vạch báo khoảng cách 2 bên BẰNG NHAU (giống Figma/Google Slides) — vẽ 1 vạch ngắn có 2 gạch chốt
// ở đầu, span đúng phần khoảng trống giữa 2 component, tại `cross` = toạ độ trục vuông góc (artboard-
// local). Luôn xuất hiện thành CẶP 2 (khoảng trống bên trái + bên phải, hoặc bên trên + bên dưới).
interface GuideSpacing {
  axis: "x" | "y";
  from: number;
  to: number;
  cross: number;
}

// Tính điểm dừng cuối cùng (có thể đã bắt dính) của 1 component đang kéo, dựa trên vị trí các
// component KHÁC đang có trên trang — 2 cơ chế, ưu tiên (1) trước, chỉ xét (2) khi (1) không khớp
// trên đúng trục đó (tránh 2 cơ chế tranh nhau kéo về 2 hướng khác nhau trên cùng 1 trục):
//   1. Căn thẳng hàng — 1 trong 3 mốc (trái/tâm/phải hoặc trên/giữa/dưới) của component đang kéo
//      trùng mốc tương ứng của canvas (tâm) hoặc 1 component khác, trong ngưỡng `threshold`.
//   2. Khoảng cách đều — component đang kéo nằm GIỮA đúng 1 component bên trái/phải (hoặc trên/dưới,
//      xác định qua overlap ở trục vuông góc) và 2 khoảng trống 2 bên chênh nhau dưới `threshold` —
//      bắt dính để 2 khoảng trống bằng NHAU HẲN (trung bình cộng), giống "Distribute spacing" của
//      Figma/Google Slides.
function computeSnap(
  dragged: Rect,
  others: Rect[],
  canvasWidth: number,
  canvasHeight: number,
  threshold: number
): { x: number; y: number; lines: GuideLine[]; spacings: GuideSpacing[] } {
  let x = dragged.x;
  let y = dragged.y;
  const lines: GuideLine[] = [];
  const spacings: GuideSpacing[] = [];

  // Trả về toạ độ ĐÍCH (candidate) nếu có 1 cặp (điểm mốc đang kéo, điểm mốc ứng viên) nào đó lọt
  // trong `threshold` — đây CHÍNH LÀ vị trí vẽ đường dóng, không phải khoảng dịch chuyển.
  function bestAlign(dragPoints: number[], candidates: number[]): number | null {
    let best: { delta: number; cand: number } | null = null;
    for (const dp of dragPoints) {
      for (const c of candidates) {
        const delta = Math.abs(dp - c);
        if (delta < threshold && (!best || delta < best.delta)) best = { delta, cand: c };
      }
    }
    return best ? best.cand : null;
  }

  const alignX = bestAlign(
    [dragged.x, dragged.x + dragged.width / 2, dragged.x + dragged.width],
    [canvasWidth / 2, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])]
  );
  if (alignX !== null) {
    // Không biết cặp match trúng đúng điểm mốc NÀO (trái/tâm/phải) của component đang kéo — dịch cả
    // object sao cho ĐIỂM MỐC GẦN `alignX` NHẤT trùng khít, đơn giản và luôn đúng vì bestAlign() đã
    // đảm bảo đây là cặp gần nhau nhất trong ngưỡng threshold.
    const dragPoints = [dragged.x, dragged.x + dragged.width / 2, dragged.x + dragged.width];
    const closest = dragPoints.reduce((a, b) => (Math.abs(b - alignX) < Math.abs(a - alignX) ? b : a));
    x = dragged.x + (alignX - closest);
    lines.push({ axis: "x", pos: alignX });
  }

  const alignY = bestAlign(
    [dragged.y, dragged.y + dragged.height / 2, dragged.y + dragged.height],
    [canvasHeight / 2, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])]
  );
  if (alignY !== null) {
    const dragPoints = [dragged.y, dragged.y + dragged.height / 2, dragged.y + dragged.height];
    const closest = dragPoints.reduce((a, b) => (Math.abs(b - alignY) < Math.abs(a - alignY) ? b : a));
    y = dragged.y + (alignY - closest);
    lines.push({ axis: "y", pos: alignY });
  }

  // Khoảng cách đều trục X — chỉ xét khi trục X CHƯA bắt dính thẳng hàng ở trên (2 cơ chế không
  // tranh nhau). "Hàng ngang" xác định qua overlap khoảng Y (dùng `y` đã bắt dính nếu có).
  if (alignX === null) {
    const rowMates = others.filter((o) => o.y < y + dragged.height && o.y + o.height > y);
    let leftN: Rect | null = null;
    let rightN: Rect | null = null;
    for (const o of rowMates) {
      if (o.x + o.width <= x) {
        if (!leftN || o.x + o.width > leftN.x + leftN.width) leftN = o;
      } else if (o.x >= x + dragged.width) {
        if (!rightN || o.x < rightN.x) rightN = o;
      }
    }
    if (leftN && rightN) {
      const gapLeft = x - (leftN.x + leftN.width);
      const gapRight = rightN.x - (x + dragged.width);
      if (gapLeft >= 0 && gapRight >= 0 && Math.abs(gapLeft - gapRight) < threshold) {
        const avgGap = (gapLeft + gapRight) / 2;
        x = leftN.x + leftN.width + avgGap;
        const cross = y + dragged.height / 2;
        spacings.push({ axis: "x", from: leftN.x + leftN.width, to: x, cross });
        spacings.push({ axis: "x", from: x + dragged.width, to: rightN.x, cross });
      }
    }
  }

  // Khoảng cách đều trục Y — mirror hệt trên, "cột dọc" xác định qua overlap khoảng X (dùng `x` đã
  // bắt dính/chỉnh ở phần trên nếu có).
  if (alignY === null) {
    const colMates = others.filter((o) => o.x < x + dragged.width && o.x + o.width > x);
    let topN: Rect | null = null;
    let bottomN: Rect | null = null;
    for (const o of colMates) {
      if (o.y + o.height <= y) {
        if (!topN || o.y + o.height > topN.y + topN.height) topN = o;
      } else if (o.y >= y + dragged.height) {
        if (!bottomN || o.y < bottomN.y) bottomN = o;
      }
    }
    if (topN && bottomN) {
      const gapTop = y - (topN.y + topN.height);
      const gapBottom = bottomN.y - (y + dragged.height);
      if (gapTop >= 0 && gapBottom >= 0 && Math.abs(gapTop - gapBottom) < threshold) {
        const avgGap = (gapTop + gapBottom) / 2;
        y = topN.y + topN.height + avgGap;
        const cross = x + dragged.width / 2;
        spacings.push({ axis: "y", from: topN.y + topN.height, to: y, cross });
        spacings.push({ axis: "y", from: y + dragged.height, to: bottomN.y, cross });
      }
    }
  }

  return { x, y, lines, spacings };
}

// Bề mặt tương tác của Builder — vẽ nền bằng chính LandingRenderer (đảm bảo không bao giờ lệch
// với Present Mode), rồi phủ lên 1 lớp overlay cùng tỉ lệ scale để xử lý chọn/kéo-di-chuyển/
// kéo-thay-đổi-kích-thước + nhận thả từ Palette. Toàn bộ math kéo-thả dùng chung 1 kiểu với
// column-resize trong DataEditorModal (mousedown → gắn mousemove/mouseup ở window, tính delta từ
// điểm bắt đầu), chỉ khác là mở rộng ra 2 trục và phải chia cho `scale` vì canvas được scale hình ảnh.
export default function LandingCanvas({
  config,
  data,
  selectedIds,
  showGrid,
  tool = "select",
  zoom = 1,
  onZoomChange,
  onSelect,
  onToggleSelect,
  onMarqueeSelect,
  onUpdateComponent,
  onDropNewComponent,
}: LandingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  // fitScale = tỉ lệ để cả artboard vừa khít khung nhìn hiện tại — đây là mốc "zoom out tối đa"
  // (zoom = 1). scale thực tế hiển thị/dùng để tính toán toạ độ = fitScale * zoom.
  const [fitScale, setFitScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 }); // kích thước vùng canvas (đã trừ thước) — dùng để vẽ ruler
  const availRef = useRef({ w: 0, h: 0 }); // bản sao đọc nhanh của avail, dùng trong closure kéo-thả
  // Đường dóng đỏ + vạch báo khoảng cách đều đang hiện trong lúc kéo (xem computeSnap()) — chỉ có
  // giá trị khi đang kéo di chuyển ĐÚNG 1 component, rỗng mọi lúc khác.
  const [guides, setGuides] = useState<{ lines: GuideLine[]; spacings: GuideSpacing[] }>({ lines: [], spacings: [] });
  // Khung marquee (rubber-band) đang kéo trên nền trống — toạ độ MÀN HÌNH (client), không cần quy đổi
  // pan/scale vì chỉ dùng để vẽ overlay `position: fixed` và so giao trực tiếp với
  // getBoundingClientRect() của từng component (xem handleWrapperMouseDown).
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null
  );
  // Bật lên ngay khi 1 lượt kéo marquee THẬT SỰ đã xảy ra (vượt ngưỡng), để chặn `onClick` (bắn SAU
  // `mouseup` trong thứ tự sự kiện DOM chuẩn) khỏi deselect-all đè lên kết quả marquee vừa chọn.
  const suppressClickRef = useRef(false);
  const { width: canvasWidth, height: canvasHeight } = config.canvas;
  const marginX = canvasWidth * PASTEBOARD_MARGIN_RATIO;
  const marginY = canvasHeight * PASTEBOARD_MARGIN_RATIO;
  const scale = fitScale * zoom;
  const surfaceW = (canvasWidth + 2 * marginX) * scale;
  const surfaceH = (canvasHeight + 2 * marginY) * scale;

  // Giới hạn pan sao cho CẢ BÀN NHÁP (khung thật + margin mỗi bên, không phải chỉ riêng khung thật)
  // luôn phủ kín khung nhìn — không cho kéo lộ khoảng trống ở rìa, và không cho kéo trôi mất cả bàn
  // nháp ra khỏi màn hình. Ở đúng mức zoom vừa khung (bàn nháp <= khung nhìn ở 1 trục), biên độ cho
  // phép ở trục đó là 0 (khoá pan hẳn), đúng như lúc zoom out tối đa — margin đã hiện đủ, không có
  // gì thêm để pan tới.
  function clampPan(next: { x: number; y: number }, atScale: number) {
    const surfaceW = (canvasWidth + 2 * marginX) * atScale;
    const surfaceH = (canvasHeight + 2 * marginY) * atScale;
    const maxX = Math.max(0, (surfaceW - availRef.current.w) / 2);
    const maxY = Math.max(0, (surfaceH - availRef.current.h) / 2);
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
      // Vừa khung nghĩa là vừa CẢ BÀN NHÁP (khung thật + margin), không chỉ riêng khung thật — nhờ
      // vậy margin luôn hiện sẵn ngay ở mức zoom mặc định (100%), không cần zoom out thêm mới thấy.
      setFitScale(Math.min(availW / (canvasWidth + 2 * marginX), availH / (canvasHeight + 2 * marginY)));
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

  // Zoom bằng con lăn chuột (Windows/macOS) hoặc cử chỉ pinch 2 ngón trên trackpad macOS, HOẶC pan
  // bằng cuộn 2 ngón thường (không chụm) khi đang bật Hand tool — giống hệt hành vi trackpad gốc của
  // macOS ở mọi nơi khác (Finder, Preview...): 2 ngón chụm/xoè = zoom, 2 ngón trượt = di chuyển. Pinch
  // (Chrome/Electron tự gắn `ctrlKey: true` cho cử chỉ này dù không hề nhấn phím Ctrl thật) LUÔN là
  // zoom bất kể tool nào đang bật. Cuộn thường (không ctrlKey) thì tuỳ tool: Hand tool → pan (đúng
  // như con lăn/2 ngón đang "cầm" khung nhìn di chuyển); Select tool → vẫn zoom như cũ (giữ đúng yêu
  // cầu trước đó: con lăn chuột thường cũng zoom được, không cần bật Hand tool trước). Công thức
  // chuẩn hoá deltaY theo deltaMode rồi khuếch đại thêm khi ctrlKey (deltaY của pinch thường nhỏ hơn
  // nhiều so với 1 nấc cuộn chuột thật) mượn nguyên heuristic đã kiểm chứng của thư viện d3-zoom. Phải
  // gắn qua addEventListener thủ công (không dùng prop onWheel của React) vì từ React 17, wheel
  // handler qua JSX luôn passive mặc định — preventDefault() bên trong sẽ bị trình duyệt bỏ qua kèm
  // warning, không chặn được cuộn trang mặc định của Electron.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (!e.ctrlKey && tool === "hand") {
        setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, scale));
        return;
      }
      if (!onZoomChange) return;
      const base = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.002;
      const delta = -e.deltaY * base * (e.ctrlKey ? 8 : 1);
      onZoomChange((z) => z + delta);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange, tool, scale, canvasWidth, canvasHeight]);

  function handleComponentMouseDown(e: React.MouseEvent, component: LandingComponent) {
    e.stopPropagation();

    // Ctrl (Windows)/Cmd (macOS) + click — cộng/trừ component này khỏi vùng chọn, KHÔNG kéo-di-chuyển
    // trong cùng thao tác (giữ đúng kỳ vọng "giữ Ctrl để chọn" thuần tuý, không lẫn với kéo).
    if (e.metaKey || e.ctrlKey) {
      onToggleSelect(component.id);
      return;
    }

    // Component đang click đã nằm sẵn trong 1 vùng chọn NHIỀU component — giữ nguyên cả vùng chọn và
    // kéo cả nhóm di chuyển cùng lúc. Ngược lại (click 1 component ngoài vùng chọn nhiều, hoặc đang
    // chỉ chọn đơn) — quay về hành vi cũ: thay thế vùng chọn bằng đúng 1 component này.
    const movingIds =
      selectedIds.includes(component.id) && selectedIds.length > 1 ? selectedIds : [component.id];
    if (movingIds.length === 1) onSelect(component.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPositions = new Map(
      movingIds.map((id) => {
        const c = config.components.find((cc) => cc.id === id);
        return [id, { x: c?.x ?? 0, y: c?.y ?? 0, width: c?.width ?? 0, height: c?.height ?? 0 }];
      })
    );

    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;

      // Kéo nhóm nhiều component — mỗi component clamp riêng vào biên bàn nháp, không áp bắt-dính-tâm
      // (chỉ có ý nghĩa rõ ràng khi kéo đúng 1 component, xem nhánh else bên dưới).
      if (movingIds.length > 1) {
        for (const id of movingIds) {
          const start = startPositions.get(id);
          if (!start) continue;
          const nextX = clamp(start.x + dx, -marginX, canvasWidth + marginX - start.width);
          const nextY = clamp(start.y + dy, -marginY, canvasHeight + marginY - start.height);
          onUpdateComponent(id, { x: nextX, y: nextY });
        }
        return;
      }

      const start = startPositions.get(component.id)!;
      // Kẹp trong CẢ BÀN NHÁP (khung thật + margin mỗi bên), không còn chỉ riêng khung thật — đây là
      // chỗ THẬT SỰ cho phép đặt component ra ngoài khung hiển thị (xem PASTEBOARD_MARGIN_RATIO).
      let nextX = clamp(start.x + dx, -marginX, canvasWidth + marginX - component.width);
      let nextY = clamp(start.y + dy, -marginY, canvasHeight + marginY - component.height);

      // Đường dóng đỏ (căn thẳng hàng mép/tâm với canvas hoặc component khác) + vạch báo khoảng cách
      // đều — xem computeSnap(). Ngưỡng tính theo px MÀN HÌNH (chia cho scale để ra ngưỡng tương ứng
      // trong không gian artboard) để cảm giác bắt dính không đổi theo mức zoom. Chỉ áp dụng cho di
      // chuyển 1 component, không áp dụng khi kéo nhóm hay resize.
      const threshold = CENTER_SNAP_PX / scale;
      const others = config.components
        .filter((c) => c.id !== component.id && !c.hiddenInBuilder)
        .map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height }));
      const snap = computeSnap(
        { x: nextX, y: nextY, width: component.width, height: component.height },
        others,
        canvasWidth,
        canvasHeight,
        threshold
      );
      nextX = snap.x;
      nextY = snap.y;
      setGuides({ lines: snap.lines, spacings: snap.spacings });

      onUpdateComponent(component.id, { x: nextX, y: nextY });
    }
    function onUp() {
      setGuides({ lines: [], spacings: [] });
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
      x = clamp(x, -marginX, canvasWidth + marginX - width);
      y = clamp(y, -marginY, canvasHeight + marginY - height);
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
    if (tool === "hand") {
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
      return;
    }

    if (tool !== "select") return;
    // Kéo-marquee trên nền trống (tới đây nghĩa là KHÔNG trúng component nào — mousedown trên
    // component đã `stopPropagation()` ở handleComponentMouseDown) — chọn mọi component GIAO với
    // khung kéo khi thả chuột. `additive` = có giữ Ctrl/Cmd lúc bắt đầu kéo hay không.
    const additive = e.metaKey || e.ctrlKey;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      const left = Math.min(startClientX, ev.clientX);
      const top = Math.min(startClientY, ev.clientY);
      const width = Math.abs(ev.clientX - startClientX);
      const height = Math.abs(ev.clientY - startClientY);
      if (!dragged && (width > 4 || height > 4)) dragged = true;
      if (dragged) setMarqueeRect({ left, top, width, height });
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setMarqueeRect(null);
      // Không kéo thật (đứng yên hoặc gần như đứng yên) — để `onClick` xử lý như 1 cú click thường
      // (deselect-all), không làm gì thêm ở đây.
      if (!dragged || !artboardRef.current) return;
      suppressClickRef.current = true;

      const left = Math.min(startClientX, ev.clientX);
      const top = Math.min(startClientY, ev.clientY);
      const right = Math.max(startClientX, ev.clientX);
      const bottom = Math.max(startClientY, ev.clientY);
      const artRect = artboardRef.current.getBoundingClientRect();
      const hits = config.components
        .filter((c) => !c.hiddenInBuilder)
        .filter((c) => {
          const compLeft = artRect.left + c.x * scale;
          const compTop = artRect.top + c.y * scale;
          const compRight = compLeft + c.width * scale;
          const compBottom = compTop + c.height * scale;
          return compLeft < right && compRight > left && compTop < bottom && compBottom > top;
        })
        .map((c) => c.id);
      onMarqueeSelect(hits, additive);
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
  // Ruler chỉ dóng đường theo đúng 1 component — khi đang chọn nhiều, không có "1 khung" rõ ràng nào
  // để dóng, nên coi như không chọn gì ở góc nhìn của ruler.
  const selectedComponent = selectedIds.length === 1 ? config.components.find((c) => c.id === selectedIds[0]) ?? null : null;

  // Khung bao XANH quanh TOÀN BỘ vùng chọn nhiều component (union bounding box) — chỉ tính khi đang
  // chọn từ 2 component trở lên, thêm VÀO chứ không thay khung viền vàng riêng từng component (xem
  // overlay bên dưới) — giúp thấy rõ biên ngoài của cả nhóm đang chọn, tách biệt hẳn khỏi màu vàng
  // dùng cho highlight từng component đơn lẻ.
  const selectionBounds =
    selectedIds.length > 1
      ? (() => {
          const comps = config.components.filter((c) => selectedIds.includes(c.id));
          if (comps.length === 0) return null;
          const left = Math.min(...comps.map((c) => c.x));
          const top = Math.min(...comps.map((c) => c.y));
          const right = Math.max(...comps.map((c) => c.x + c.width));
          const bottom = Math.max(...comps.map((c) => c.y + c.height));
          return { left, top, width: right - left, height: bottom - top };
        })()
      : null;

  // Minimap góc dưới-phải — thu nhỏ TOÀN BỘ bàn nháp (không chỉ khung thật) vào 1 ô cố định
  // MINIMAP_WIDTH px, vẽ khung thật (viền mảnh) + khung nhìn hiện tại (viền vàng, chính là phần
  // avail.w x avail.h đang thấy trên màn hình, quy đổi ngược về không gian toạ độ thật rồi thu nhỏ
  // theo minimapScale) — dùng để xác nhận trực quan pan có kẹp đối xứng 2 bên hay không, thay vì
  // phải đọc số trên ruler bằng mắt. `originX/originY` giống hệt công thức trong LandingRulers.tsx
  // (v=0 luôn là cạnh khung THẬT trên màn hình) — suy ngược lại toạ độ thật tại 2 mép trái/phải và
  // trên/dưới của khung nhìn từ đó.
  const minimapPastW = canvasWidth + 2 * marginX;
  const minimapPastH = canvasHeight + 2 * marginY;
  const minimapScale = MINIMAP_WIDTH / minimapPastW;
  const minimapHeight = minimapPastH * minimapScale;
  const originX = (avail.w - canvasWidth * scale) / 2 + pan.x;
  const originY = (avail.h - canvasHeight * scale) / 2 + pan.y;
  const viewLeft = -originX / scale;
  const viewTop = -originY / scale;
  const viewRight = (avail.w - originX) / scale;
  const viewBottom = (avail.h - originY) / scale;
  const toMinimapX = (v: number) => clamp((v + marginX) * minimapScale, 0, MINIMAP_WIDTH);
  const toMinimapY = (v: number) => clamp((v + marginY) * minimapScale, 0, minimapHeight);
  const viewRectLeft = toMinimapX(viewLeft);
  const viewRectTop = toMinimapY(viewTop);
  const viewRectRight = toMinimapX(viewRight);
  const viewRectBottom = toMinimapY(viewBottom);

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden bg-base-950">
      <LandingRulers
        scale={scale}
        pan={pan}
        avail={avail}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        marginX={marginX}
        marginY={marginY}
        selection={selectedComponent}
      />

      {/* Vùng canvas thực — trừ đúng phần bị 2 thanh thước chiếm ở rìa trên/trái. */}
      <div
        ref={viewportRef}
        className={`absolute flex items-center justify-center overflow-hidden ${
          tool === "hand" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ left: RULER_SIZE, top: RULER_SIZE, right: 0, bottom: 0 }}
        onClick={() => {
          // `click` bắn SAU `mouseup` trong thứ tự sự kiện DOM — nếu vừa kéo-marquee thật sự xong
          // (đã xử lý chọn ở handleWrapperMouseDown's onUp), bỏ qua đúng 1 lần click này, không để nó
          // deselect-all đè lên kết quả marquee vừa chọn.
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onSelect(null);
        }}
        onMouseDown={handleWrapperMouseDown}
        onDoubleClick={() => tool === "hand" && setPan({ x: 0, y: 0 })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* "Bàn nháp" (pasteboard) — khung thật + margin mỗi bên (xem PASTEBOARD_MARGIN_RATIO), nền
            khác màu để phân biệt rõ với khung hiển thị thật bên trong. Đây là phần được pan/scale;
            khung thật (artboardRef) chỉ là 1 ô con đứng yên bên trong nó, lệch đúng margin*scale.
            `shrink-0` BẮT BUỘC — div này là flex item của viewportRef (flex items-center
            justify-center), mọi nội dung bên trong nó lại toàn `position: absolute` (không đóng góp
            gì vào min-content width/height của chính nó) nên KHÔNG có gì chặn flex-shrink mặc định
            (flex-shrink: 1) co nhỏ nó lại dưới đúng width/height đã khai báo (surfaceW/surfaceH) mỗi
            khi bàn nháp to hơn khung nhìn (tức là mọi lúc đã zoom > 100%) — kích thước THỰC TẾ trên
            màn hình khi đó lệch khỏi surfaceW/surfaceH mà clampPan/ruler/minimap đều giả định, gây
            đúng bug "minimap tính đối xứng nhưng canvas thật hiển thị lệch" (minimap thuần tính bằng
            JS từ pan/scale, không hỏi DOM đã render to bao nhiêu — vẫn tự nhất quán dù DOM sai; canvas
            thật thì bị ảnh hưởng trực tiếp bởi kích thước đã bị co). */}
        <div
          className="relative shrink-0 bg-base-900"
          style={{
            width: surfaceW,
            height: surfaceH,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            ref={artboardRef}
            // Viền đậm + tối hẳn (khác biệt rõ với nền bàn nháp base-900 rất nhạt và với viền
            // outline-gold-500 dùng riêng cho trạng thái "đang chọn" của component) — outline-1
            // trước đó gần như không thấy được, khiến ranh giới khung thật/bàn nháp bị mờ nhoè.
            className="absolute shadow-2xl outline outline-2 outline-base-400"
            style={{
              left: marginX * scale,
              top: marginY * scale,
              width: canvasWidth * scale,
              height: canvasHeight * scale,
            }}
          >
            <LandingRenderer config={config} data={data} scale={scale} clip={false} />

            {/* Đường dóng đỏ báo đang căn thẳng hàng (mép/tâm trùng canvas hoặc 1 component khác) —
                giống Photoshop/Figma/Google Slides smart guide, chỉ hiện trong lúc kéo di chuyển,
                biến mất ngay khi thả chuột hoặc lệch khỏi ngưỡng (xem computeSnap()). */}
            {guides.lines.map((g, i) =>
              g.axis === "x" ? (
                <div
                  key={`gl-${i}`}
                  className="pointer-events-none absolute top-0 h-full w-px bg-danger-500"
                  style={{ left: g.pos * scale }}
                />
              ) : (
                <div
                  key={`gl-${i}`}
                  className="pointer-events-none absolute left-0 w-full h-px bg-danger-500"
                  style={{ top: g.pos * scale }}
                />
              )
            )}

            {/* Vạch báo khoảng cách 2 bên BẰNG NHAU — 1 vạch mảnh + 2 gạch chốt ở đầu, đúng span
                khoảng trống giữa component đang kéo và component liền kề (xem computeSnap()). Luôn
                hiện thành cặp (trái+phải hoặc trên+dưới). */}
            {guides.spacings.map((s, i) =>
              s.axis === "x" ? (
                <div
                  key={`gs-${i}`}
                  className="pointer-events-none absolute h-px bg-danger-500"
                  style={{ left: s.from * scale, width: (s.to - s.from) * scale, top: s.cross * scale }}
                >
                  <div className="absolute -top-1 left-0 h-2 w-px bg-danger-500" />
                  <div className="absolute -top-1 right-0 h-2 w-px bg-danger-500" />
                </div>
              ) : (
                <div
                  key={`gs-${i}`}
                  className="pointer-events-none absolute w-px bg-danger-500"
                  style={{ top: s.from * scale, height: (s.to - s.from) * scale, left: s.cross * scale }}
                >
                  <div className="absolute -left-1 top-0 h-px w-2 bg-danger-500" />
                  <div className="absolute -left-1 bottom-0 h-px w-2 bg-danger-500" />
                </div>
              )
            )}

            {/* Overlay tương tác — cùng toạ độ/scale với artboard bên dưới, chỉ vẽ viền/handle, không che nội dung.
                Tắt hẳn pointer-events khi đang dùng Hand tool để mousedown luôn rơi xuống wrapper (pan),
                không bị component "chặn" ở giữa đường. Lọc bỏ component có hiddenInBuilder (bật/tắt qua
                LayersPanel.tsx) khỏi khung chọn/kéo-thả — không thì dù LandingRenderer đã ẩn phần vẽ,
                khung tương tác vô hình ở đây vẫn còn nguyên, vẫn chặn click của component khác nằm
                dưới/cạnh nó. Ô kéo-thả vẫn hiện được ở NGOÀI khung thật (toạ độ x/y âm hoặc vượt quá
                canvasWidth/Height) vì overlay này KHÔNG bị artboardRef clip — và phần vẽ nội dung thật
                (LandingRenderer) ở Builder cũng KHÔNG còn tự ẩn ở đó nữa (truyền `clip={false}` — xem
                LandingRenderer.tsx), nên nội dung thật của component vẫn thấy được cả khi đang đặt ở
                bàn nháp, không chỉ riêng khung chọn vô hình. Present Mode/LandingPage.tsx vẫn clip bình
                thường (không truyền `clip`, mặc định true) nên bàn nháp KHÔNG BAO GIỜ lọt vào buổi
                trình chiếu thật, chỉ là tiện ích riêng của màn hình chỉnh sửa. SẮP XẾP theo zIndex TĂNG
                DẦN giống hệt LandingRenderer.tsx (component zIndex cao hơn = vẽ sau = nằm cuối DOM =
                bắt click trước) — thiếu bước sắp xếp này thì thứ tự bắt click (theo thứ tự MẢNG gốc,
                tức thứ tự TẠO component) sẽ lệch khỏi thứ tự hiển thị thật (theo zIndex, đổi được qua
                kéo-thả trong Layers panel): 1 component to phủ cả canvas (vd Fireworks mặc định
                1920x1080) nếu rơi vào tình huống này sẽ vô tình chặn click của MỌI component khác dù
                đang nằm dưới nó về mặt hiển thị. */}
            <div className={tool === "hand" ? "pointer-events-none" : ""}>
              {[...config.components]
                .filter((c) => !c.hiddenInBuilder)
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((component) => {
                  const isSelected = selectedIds.includes(component.id);
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
                      {/* Handle resize 4 góc — CHỈ hiện khi đang chọn ĐÚNG 1 component (resize nhiều
                          component cùng lúc không có ngữ nghĩa rõ ràng, không nằm trong yêu cầu). */}
                      {isSelected &&
                        selectedIds.length === 1 &&
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

            {/* Khung bao XANH quanh cả vùng chọn nhiều component — xem selectionBounds. Đặt SAU overlay
                tương tác ở trên trong DOM để luôn nổi TRÊN các khung viền vàng riêng từng component. */}
            {selectionBounds && (
              <div
                className="pointer-events-none absolute outline outline-2 outline-teal-500"
                style={{
                  left: selectionBounds.left * scale,
                  top: selectionBounds.top * scale,
                  width: selectionBounds.width * scale,
                  height: selectionBounds.height * scale,
                }}
              />
            )}
          </div>

        </div>

        {/* Lưới căn chỉnh — chỉ để mắt nhìn theo cho dễ, KHÔNG snap toạ độ vào lưới. Đặt hẳn ở cấp
            viewport (KHÔNG phải bên trong "bàn nháp" nữa, dù logic vẫn phủ đều cả bàn nháp lẫn khung
            thật) — kích thước phần tử LUÔN cố định = khung nhìn thực tế (avail.w x avail.h), không
            phình to theo scale/zoom như trước. Trước đây lưới nằm TRONG "bàn nháp" nên kích thước tỉ
            lệ thuận với zoom (bàn nháp 4K x zoom cao có thể vượt hàng nghìn px) — 1 div CSS
            repeating-gradient rất lớn kiểu này gặp đúng bug render đã biết của Chromium/Skia (tile
            nội bộ GPU có giới hạn kích thước, background lặp bị "đứt"/biến mất từng đoạn past 1 mốc
            offset, càng rõ khi kết hợp transform ở phần tử cha) — đúng triệu chứng đã gặp: mất lưới
            từng mảng khi zoom cao, KHÔNG xảy ra ở zoom 100% (bàn nháp lúc đó vừa đúng khung nhìn, còn
            nhỏ). Cố định kích thước theo viewport loại bỏ hẳn nguyên nhân gốc, không phụ thuộc bàn
            nháp lớn cỡ nào. Bù lại phải tự tính `backgroundPosition` bằng tay (không còn "kế thừa"
            free từ toạ độ bàn nháp): quy về hệ toạ độ màn hình local của viewport — bàn nháp được
            flexbox canh giữa (`(avail.w - surfaceW)/2`) rồi mới cộng `pan` (transform) — cộng thêm
            `marginX/marginY * scale` để neo đúng gốc (0,0) của KHUNG THẬT bên trong bàn nháp (margin
            chưa chắc chia hết GRID_SIZE, vd marginY=540 không chia hết 40 — thiếu neo này lưới lệch
            pha ngay tại đường biên khung thật/bàn nháp). Đặt SAU pasteboard trong DOM để luôn nổi
            TRÊN nội dung thật. */}
        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
              backgroundPosition: `${(avail.w - surfaceW) / 2 + pan.x + marginX * scale}px ${
                (avail.h - surfaceH) / 2 + pan.y + marginY * scale
              }px`,
            }}
          />
        )}

        {/* Khung marquee đang kéo — `position: fixed` vì marqueeRect đã ở toạ độ MÀN HÌNH (client),
            không phụ thuộc pan/scale/vị trí lồng nhau của phần tử cha. */}
        {marqueeRect && (
          <div
            className="pointer-events-none fixed z-30 outline outline-1 outline-gold-500 bg-gold-500/10"
            style={{ left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height }}
          />
        )}
      </div>

      {/* Minimap góc dưới-phải — luôn nổi TRÊN viewportRef (là sibling đứng SAU trong wrapperRef,
          không nằm trong overflow-hidden/transform của nó) nên không bị pan/zoom của canvas ảnh
          hưởng. Viền vàng = khung nhìn hiện tại, đối chiếu trực quan xem có kẹp đối xứng 2 bên khi
          kéo Hand tool hết cỡ hay không. */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-lg border border-base-700 bg-base-900/95 p-1.5 shadow-lg">
        <div className="relative bg-base-800" style={{ width: MINIMAP_WIDTH, height: minimapHeight }}>
          <div
            className="absolute border border-base-500"
            style={{
              left: marginX * minimapScale,
              top: marginY * minimapScale,
              width: canvasWidth * minimapScale,
              height: canvasHeight * minimapScale,
            }}
          />
          <div
            className="absolute border-2 border-gold-500 bg-gold-500/10"
            style={{
              left: viewRectLeft,
              top: viewRectTop,
              width: viewRectRight - viewRectLeft,
              height: viewRectBottom - viewRectTop,
            }}
          />
        </div>
      </div>
    </div>
  );
}
