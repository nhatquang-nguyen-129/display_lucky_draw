export const RULER_SIZE = 22; // px — độ dày thanh thước, trừ vào phần khung nhìn dành cho artboard

interface LandingRulersProps {
  scale: number;
  pan: { x: number; y: number };
  avail: { w: number; h: number }; // kích thước vùng canvas thực tế (đã trừ RULER_SIZE)
  canvasWidth: number;
  canvasHeight: number;
  // Phần "bàn nháp" mở rộng thêm 2 bên trục X/Y quanh khung thật (xem PASTEBOARD_MARGIN_RATIO trong
  // LandingCanvas.tsx) — chỉ dùng để KÉO DÀI phạm vi vạch chia ra âm/vượt canvasWidth-Height, không
  // ảnh hưởng gì tới originX/originY (v=0 vẫn luôn là cạnh khung THẬT, không phải cạnh bàn nháp).
  marginX: number;
  marginY: number;
  selection?: { x: number; y: number; width: number; height: number } | null;
}

/** Chọn bước chia "đẹp" (1/2/5 × luỹ thừa 10) sao cho khoảng cách giữa 2 vạch chính trên màn hình
 * gần với targetPx — thuật toán ruler tiêu chuẩn, giống Photoshop/Figma tự đổi mật độ vạch theo zoom. */
function niceStep(scale: number, targetPx = 80): number {
  const raw = targetPx / scale;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return niceResidual * magnitude;
}

// Thanh thước ngang (trên) + dọc (trái), giống Photoshop — chỉ hiển thị, không tương tác
// (pointer-events-none), luôn nằm cố định ở rìa khung nhìn trong khi vạch số bên trong dịch theo
// scale/pan của artboard. Ô vuông góc trên-trái + phần tô sáng theo component đang chọn.
export default function LandingRulers({
  scale,
  pan,
  avail,
  canvasWidth,
  canvasHeight,
  marginX,
  marginY,
  selection,
}: LandingRulersProps) {
  const originX = (avail.w - canvasWidth * scale) / 2 + pan.x;
  const originY = (avail.h - canvasHeight * scale) / 2 + pan.y;
  const step = niceStep(scale);
  const minorStep = step / 5;

  // Vạch chia trải dài hết phần "bàn nháp" (âm ở đầu, vượt canvasWidth/Height ở cuối) — không chỉ
  // riêng khung thật — để thấy được toạ độ của cả những component đang đặt ngoài khung hiển thị.
  const hTicks: number[] = [];
  for (let v = -marginX; v <= canvasWidth + marginX + minorStep; v += minorStep) hTicks.push(Math.round(v * 100) / 100);
  const vTicks: number[] = [];
  for (let v = -marginY; v <= canvasHeight + marginY + minorStep; v += minorStep) vTicks.push(Math.round(v * 100) / 100);

  // Dùng "true mod" (luôn dương) thay vì % thuần của JS — % giữ dấu của số bị chia nên với v ÂM
  // (giờ có thật, xem hTicks/vTicks phía trên trải cả vào phần bàn nháp) phép kiểm tra cũ sẽ luôn
  // sai (vd -480 % 100 = -80 trong JS, không phải 20), khiến vạch chính không được nhận diện đúng.
  const isMajor = (v: number) => {
    const mod = ((v % step) + step) % step;
    return mod < 0.01 || step - mod < 0.01;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Ô góc trên-trái, che chỗ giao nhau của 2 thước */}
      <div
        className="absolute left-0 top-0 border-b border-r border-base-700 bg-base-900"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* Thước ngang */}
      <div
        className="absolute top-0 overflow-hidden border-b border-base-700 bg-base-900"
        style={{ left: RULER_SIZE, right: 0, height: RULER_SIZE }}
      >
        {selection && (
          <div
            className="absolute top-0 h-full bg-gold-500/25"
            style={{ left: originX + selection.x * scale, width: selection.width * scale }}
          />
        )}
        {hTicks.map((v) => {
          const x = originX + v * scale;
          if (x < -1 || x > avail.w + 1) return null;
          const major = isMajor(v);
          return (
            <div key={v} className="absolute bottom-0 border-l border-base-500" style={{ left: x, height: major ? 10 : 5 }}>
              {major && (
                <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[9px] leading-none text-base-400">
                  {Math.round(v)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Thước dọc — số xoay 90° để vừa dải hẹp, giống ruler dọc của Photoshop. */}
      <div
        className="absolute left-0 overflow-hidden border-r border-base-700 bg-base-900"
        style={{ top: RULER_SIZE, bottom: 0, width: RULER_SIZE }}
      >
        {selection && (
          <div
            className="absolute left-0 w-full bg-gold-500/25"
            style={{ top: originY + selection.y * scale, height: selection.height * scale }}
          />
        )}
        {vTicks.map((v) => {
          const y = originY + v * scale;
          if (y < -1 || y > avail.h + 1) return null;
          const major = isMajor(v);
          return (
            <div key={v} className="absolute right-0 border-t border-base-500" style={{ top: y, width: major ? 10 : 5 }}>
              {major && (
                <span
                  className="absolute left-0.5 top-0.5 whitespace-nowrap text-[9px] leading-none text-base-400"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "left top" }}
                >
                  {Math.round(v)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
