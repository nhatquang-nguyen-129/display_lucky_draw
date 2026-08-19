import { useEffect, useId, useRef, useState } from "react";
import { ensureAlphaLoaded, nearestOpaqueBoxFraction } from "./pixelAlphaHitTest";

// Vẽ ĐÈ lên đúng ảnh giải thật trong canvas Builder (LandingCanvas.tsx) khi component đang chọn có
// Scale Up HOẶC Lift (dùng CHUNG component này — xem doc-comment AnchorEditTarget/PrizeGroupEffect
// trong types.ts, và LandingCanvas.tsx's renderAnchorOverlay cho cách 2 effect này khác nhau ở NGUỒN
// toạ độ Anchor: scaleUp đọc directionX/Y người dùng đã thả; lift LUÔN cố định (50,50) — chính giữa
// khung, truyền thẳng vào `anchorX/anchorY` không qua field riêng nào). 3 mode:
//   - "placing" (CHỈ scaleUp — lift không có, luôn vào thẳng "editing") — vừa bấm "Drop anchor point",
//     CHƯA có Anchor lượt này, con trỏ crosshair + 1 chấm mờ bám theo chuột (đã bám pixel thật gần
//     nhất, xem `hover`), CLICK 1 CÁI để "thả" Anchor xuống đúng pixel hiển thị gần điểm click nhất —
//     LUÔN rơi vào vùng có pixel thật của PNG. Đặt xong, Direction tự đặt CHỒNG lên Anchor (khoảng
//     cách 0 = chưa có zoom) và chuyển thẳng sang mode "editing".
//   - "editing" — Anchor/điểm cố định KHÔNG kéo được (xem ghi chú tại pin Anchor bên dưới), CHỈ pin
//     Direction (vàng) kéo-thả tự do được để chỉnh hướng + mức độ (khoảng cách Euclid tới Anchor = %
//     zoom hoặc px dịch chuyển, xem computePrizeTransform trong prizeEffectTransform.ts).
//   - "locked" — không kéo-thả gì cả, CẢ 2 PIN VẪN HIỆN làm tư liệu tham khảo (không mất dấu vết đã
//     cấu hình gì — trước đây thoát chế độ sửa là mất trắng pin, gây bối rối không biết đã kéo hay
//     chưa, đây là lý do mode này tồn tại thay vì ẩn hẳn) cho tới khi bấm "Edit" (quay lại "editing")
//     hoặc "Remove"/"Reset" ở ScaleAnchorTrigger.tsx/LiftDirectionTrigger.tsx.
// `rect` do LandingCanvas.tsx tính sẵn (đã nhân `scale`, đặt tương đối trong đúng wrapper của Prize
// Image đang chọn — component DUY NHẤT còn dùng Anchor/Direction).
// `pointer-events-auto` ở root BẮT BUỘC khi "placing"/"editing" — cha của nó (lớp tương tác chọn/kéo-thả
// component trong LandingCanvas.tsx) tự tắt hẳn `pointer-events` suốt 2 mode này, để 2 prize đặt
// gần/chồng bounding box nhau (use-case CHÍNH của Prize Image) không còn vô tình hover/click trúng
// prize KHÁC cạnh bên khi đang thả/kéo điểm neo (bug đã gặp thật) — CHỈ overlay này tự bật lại tương
// tác. Mode "locked" KHÔNG cần (chính overlay cũng không bắt sự kiện gì để bảo vệ).
export default function ScaleAnchorOverlay({
  rect,
  mode,
  anchorX,
  anchorY,
  handleX,
  handleY,
  onPlaceAnchor,
  onChangeHandle,
  onDone,
  imageSrc,
  fit = "cover",
}: {
  rect: { left: number; top: number; width: number; height: number };
  mode: "placing" | "editing" | "locked";
  anchorX: number;
  anchorY: number;
  handleX: number;
  handleY: number;
  onPlaceAnchor: (x: number, y: number) => void;
  onChangeHandle: (x: number, y: number) => void;
  onDone: () => void;
  // `null`/thiếu ảnh (chưa chọn Prize cho Prize Image này) — vẫn kéo-thả/thả được,
  // chỉ không có ảnh nền + không bám pixel thật được (mọi hàm bám pixel tự fallback trả nguyên toạ độ
  // đầu vào — xem nearestOpaqueBoxFraction trong pixelAlphaHitTest.ts).
  imageSrc?: string | null;
  fit?: "cover" | "contain" | "stretch";
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const arrowId = useId();
  // Chấm mờ bám theo chuột lúc đang "placing" — null khi chuột chưa vào khung hoặc đã rời ra.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    ensureAlphaLoaded(imageSrc);
  }, [imageSrc]);

  function pointerToPercent(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    };
  }

  function snapToOpaque(x: number, y: number): { x: number; y: number } {
    if (!imageSrc) return { x, y };
    const snapped = nearestOpaqueBoxFraction(imageSrc, x / 100, y / 100, rect.width, rect.height, fit);
    return { x: snapped.x * 100, y: snapped.y * 100 };
  }

  function handlePlacingMouseMove(e: React.MouseEvent) {
    const p = pointerToPercent(e.clientX, e.clientY);
    setHover(p ? snapToOpaque(p.x, p.y) : null);
  }

  function handlePlacingClick(e: React.MouseEvent) {
    e.stopPropagation();
    const p = pointerToPercent(e.clientX, e.clientY);
    if (!p) return;
    const snapped = snapToOpaque(p.x, p.y);
    onPlaceAnchor(Math.round(snapped.x), Math.round(snapped.y));
  }

  // Chỉ pin Direction kéo được — Anchor cố định NGAY sau lúc thả (xem doc-comment đầu file), không còn
  // hit-test "pin nào gần hơn" như bản trước (gây nhầm: vừa thả xong 2 pin trùng nhau y hệt, luôn đoán
  // trúng Anchor thay vì Direction — đúng bug người dùng báo).
  function handleDirectionMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const start = pointerToPercent(e.clientX, e.clientY);
    if (!start) return;
    onChangeHandle(Math.round(start.x), Math.round(start.y));

    function onMove(ev: MouseEvent) {
      const p = pointerToPercent(ev.clientX, ev.clientY);
      if (p) onChangeHandle(Math.round(p.x), Math.round(p.y));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const backgroundSize = fit === "stretch" ? "100% 100%" : fit;
  const interactive = mode !== "locked";

  return (
    // KHÔNG `overflow-hidden` ở NGOÀI CÙNG — nút "Done" cố tình đặt lệch RA NGOÀI khung (góc trên-phải,
    // xem bên dưới) để không đè lên pin/ảnh, overflow-hidden ở đây sẽ CẮT MẤT nó (bug thật đã gặp khi
    // viết bản đầu). Chỉ lớp ẢNH NỀN bên trong mới cần overflow-hidden (tránh ảnh `cover` tràn ra ngoài
    // khung), các lớp còn lại (pin/mũi tên/chấm hover) không cần vì toạ độ luôn nằm trong 0-100%.
    <div
      ref={surfaceRef}
      onMouseDown={mode === "editing" ? handleDirectionMouseDown : undefined}
      onMouseMove={mode === "placing" ? handlePlacingMouseMove : undefined}
      onMouseLeave={mode === "placing" ? () => setHover(null) : undefined}
      onClick={mode === "placing" ? handlePlacingClick : undefined}
      className={`absolute rounded outline outline-2 outline-gold-500 bg-base-950/10 ${
        interactive ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
      }`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {imageSrc && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${imageSrc})`, backgroundSize }}
        />
      )}

      {mode === "placing" ? (
        hover && (
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-base-950 bg-teal-400 opacity-70 shadow"
            style={{ left: `${hover.x}%`, top: `${hover.y}%` }}
          />
        )
      ) : (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#FFCA2D" />
              </marker>
            </defs>
            <line x1={anchorX} y1={anchorY} x2={handleX} y2={handleY} stroke="#FFCA2D" strokeWidth={1.5} markerEnd={`url(#${arrowId})`} />
          </svg>

          {/* Anchor/điểm cố định — KHÔNG kéo được (scaleUp: chỉ đổi được bằng cách "Drop" lại từ đầu;
              lift: luôn cố định, không đổi được). */}
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-base-950 bg-teal-400 shadow"
            style={{ left: `${anchorX}%`, top: `${anchorY}%` }}
          />
          {/* Direction — kéo xa/gần Anchor để chỉnh hướng + % zoom, chỉ kéo được ở mode "editing". */}
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-base-950 bg-highlight-500 shadow"
            style={{ left: `${handleX}%`, top: `${handleY}%` }}
          />
        </>
      )}

      {mode === "editing" && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="absolute -top-2.5 -right-2.5 rounded-full border border-base-950 bg-gold-500 px-2 py-0.5 text-[10px] font-medium text-base-950 shadow"
        >
          Done
        </button>
      )}
    </div>
  );
}
