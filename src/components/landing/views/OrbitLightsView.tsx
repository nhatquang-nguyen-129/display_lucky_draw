import { useEffect, useRef } from "react";
import {
  DEFAULT_DRAW_CYCLE,
  isLiveDrawResultId,
  LandingData,
  orbitLightColor,
  OrbitLightsComponent,
  OrbitLightsProps,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";

// Số đoạn thẳng xấp xỉ vệt dài nhất (60% vòng) — đủ mịn mà vẫn rẻ.
const TRAIL_SEGMENTS = 48;
// Số nét chồng lên nhau tạo độ mờ dần của vệt (xem drawFrame) — 3 hạt × 12 nét/khung hình, rất nhẹ.
const TRAIL_LAYERS = 12;

// Vẽ ĐÚNG 1 khung hình tại thời điểm `elapsedMs` — dùng chung cho cả khung tĩnh (Builder) lẫn vòng
// lặp rAF (Present Mode), nên 2 nơi luôn giống hệt nhau về hình dáng.
function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, props: OrbitLightsProps, elapsedMs: number) {
  const count = Math.max(1, Math.min(6, Math.round(props.particleCount)));
  const size = Math.max(1, props.particleSize);
  const ratio = Math.max(0.1, Math.min(1, props.orbitWidth / 100));
  const trail = (Math.max(0, Math.min(60, props.trailLength)) / 100) * Math.PI * 2;
  // Chừa lề bằng quầng sáng của hạt để hạt bay sát mép khung không bị canvas cắt mất.
  const pad = size * 4;
  const cx = w / 2;
  const cy = h / 2;
  const ax = Math.max(1, w / 2 - pad);
  const ay = Math.max(1, h / 2 - pad);
  const progress = (elapsedMs / Math.max(500, props.revolutionMs)) * Math.PI * 2;

  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  // "butt": đầu nét phẳng — đầu tròn của các nét vệt chồng nhau sẽ phồng lên thành nốt sáng.
  ctx.lineCap = "butt";

  for (let i = 0; i < count; i++) {
    // Quỹ đạo i xoay đều nhau trong nửa vòng (3 quỹ đạo = lệch nhau 60°, đúng kiểu biểu tượng nguyên
    // tử); pha xuất phát lệch đều cả vòng để các hạt không chụm vào 1 chỗ.
    const tilt = (Math.PI * i) / count;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const point = (t: number): [number, number] => {
      const ex = Math.cos(t);
      const ey = ratio * Math.sin(t);
      return [cx + (ex * cosT - ey * sinT) * ax, cy + (ex * sinT + ey * cosT) * ay];
    };
    const head = progress + (Math.PI * 2 * i) / count;
    const color = orbitLightColor(props, i);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (props.showOrbits) {
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let s = 0; s <= 96; s++) {
        const [x, y] = point((s / 96) * Math.PI * 2);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Vệt sáng: chồng TRAIL_LAYERS nét LIỀN cùng kết thúc ở hạt, nét càng ngắn càng dày — cộng sáng
    // ("lighter") nên càng gần hạt càng đậm + dày, đuôi mờ + mảnh dần. Không vẽ từng đoạn rời vì đầu
    // tròn của các đoạn chồng nhau sẽ cộng sáng thành chuỗi hạt cườm lấm tấm.
    if (trail > 0) {
      for (let k = 1; k <= TRAIL_LAYERS; k++) {
        const f = k / TRAIL_LAYERS; // 1 = nét dài nhất (mảnh nhất)
        const from = head - trail * f;
        const steps = Math.max(2, Math.ceil(TRAIL_SEGMENTS * f));
        ctx.globalAlpha = 1.2 / TRAIL_LAYERS;
        ctx.lineWidth = size * (1.6 - 1.3 * f);
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const [x, y] = point(from + ((head - from) * s) / steps);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Hạt: quầng mờ lớn → thân màu có glow (shadowBlur rẻ hơn blur thật) → lõi trắng.
    const [hx, hy] = point(head);
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(hx, hy, size * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 4;
    ctx.beginPath();
    ctx.arc(hx, hy, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(hx, hy, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// `animate` CHỈ true ở Present Mode thật — Builder/LandingPage.tsx chỉ vẽ 1 khung tĩnh (quy ước chung
// của mọi effect, xem docs/landing/effects.md mục 2), tránh chạy rAF liên tục lúc đang kéo-thả.
// data/builderPreview/resetSeq CHỈ dùng khi `props.syncWithDraw` bật — cùng cơ chế ImageView.tsx.
export default function OrbitLightsView({
  component,
  animate,
  data,
  builderPreview,
  resetSeq,
}: {
  component: OrbitLightsComponent;
  animate?: boolean;
  data?: LandingData;
  builderPreview?: boolean;
  resetSeq?: number;
}) {
  const { syncWithDraw, drawCycle } = component.props;
  const latest = data?.results[0];
  // Chỉ 1 lượt Draw LIVE mới tính là mốc Draw/Redraw thật — xem chú thích tương tự trong ImageView.tsx.
  const liveResultId = isLiveDrawResultId(latest?.id) ? latest!.id : undefined;
  const { shown, transitionClass } = useDrawCycleVisibility(liveResultId, drawCycle ?? DEFAULT_DRAW_CYCLE, resetSeq);
  // Builder LUÔN hiện để còn thấy mà chọn/kéo/resize; lúc ẩn thì unmount hẳn canvas → dừng luôn rAF.
  const visible = !syncWithDraw || builderPreview || shown;

  return visible ? (
    <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
      <OrbitLightsCanvas component={component} animate={animate} />
    </div>
  ) : null;
}

function OrbitLightsCanvas({ component, animate }: { component: OrbitLightsComponent; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mốc thời gian bắt đầu giữ qua các lần đổi props (Present Mode poll config mỗi 2s) — đổi màu/tốc
  // độ không làm hạt "giật" về vị trí xuất phát.
  const startRef = useRef<number | null>(null);
  const { width, height, props } = component;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = width;
    canvas.height = height;

    if (!animate) {
      drawFrame(ctx, width, height, props, 0);
      return;
    }

    let raf = 0;
    const loop = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      drawFrame(ctx, width, height, props, now - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, width, height, props]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
