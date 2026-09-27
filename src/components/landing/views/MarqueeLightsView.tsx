import { useEffect, useRef } from "react";
import {
  DEFAULT_DRAW_CYCLE,
  drawCycleResultId,
  LandingData,
  MarqueeLightsComponent,
  MarqueeLightsProps,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";

// Viền bóng đèn chạy — cùng khuôn OrbitLightsView.tsx: sáng/tắt của từng bóng là hàm THUẦN theo
// (chỉ số bóng, thời gian), không có trạng thái mô phỏng, nên 1 hàm drawFrame dùng chung cho khung
// tĩnh Builder (elapsedMs = 0) lẫn rAF ở Present Mode.

const OFF_ALPHA = 0.22; // bóng tắt vẫn thấy mờ mờ lớp kính màu, không biến mất hẳn
const HALO_SCALE = 3; // bán kính quầng sáng = bulbSize × ngần này

// Quầng sáng của 1 bóng vẽ SẴN 1 lần vào canvas phụ (theo màu + kích thước) rồi drawImage mỗi khung
// hình — rẻ hơn hẳn shadowBlur/radial gradient × hàng trăm bóng × 60fps.
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

function bulbSprite(color: string, radius: number): HTMLCanvasElement {
  const key = `${color}|${radius}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const half = Math.ceil(radius * HALO_SCALE);
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = half * 2;
  const ctx = sprite.getContext("2d")!;
  const [r, g, b] = hexToRgb(color);
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Lõi gần trắng → thân đúng màu (hết bán kính bóng) → quầng mờ dần ra ngoài.
  const bodyStop = 1 / HALO_SCALE;
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(bodyStop * 0.45, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(bodyStop, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(bodyStop * 1.25, `rgba(${r},${g},${b},0.3)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, half * 2, half * 2);
  spriteCache.set(key, sprite);
  return sprite;
}

// Chia đều `count` điểm dọc đường viền chữ nhật bo góc (theo chiều kim đồng hồ, bắt đầu từ mép trên
// ngay sau góc trên-trái). Mỗi đoạn = 1 cạnh thẳng hoặc 1 cung 1/4 tròn.
function perimeterPoints(left: number, top: number, right: number, bottom: number, radius: number, count: number) {
  const rr = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2));
  type Seg = { len: number; at: (t: number) => [number, number] };
  const line = (x0: number, y0: number, x1: number, y1: number): Seg => ({
    len: Math.hypot(x1 - x0, y1 - y0),
    at: (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t],
  });
  const arc = (cx: number, cy: number, fromDeg: number): Seg => ({
    len: (Math.PI / 2) * rr,
    at: (t) => {
      const a = ((fromDeg + 90 * t) * Math.PI) / 180;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    },
  });
  const segs: Seg[] = [
    line(left + rr, top, right - rr, top),
    arc(right - rr, top + rr, -90),
    line(right, top + rr, right, bottom - rr),
    arc(right - rr, bottom - rr, 0),
    line(right - rr, bottom, left + rr, bottom),
    arc(left + rr, bottom - rr, 90),
    line(left, bottom - rr, left, top + rr),
    arc(left + rr, top + rr, 180),
  ].filter((s) => s.len > 0);
  const total = segs.reduce((sum, s) => sum + s.len, 0);
  const points: [number, number][] = [];
  let segIndex = 0;
  let segStart = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total;
    while (segIndex < segs.length - 1 && d > segStart + segs[segIndex].len) {
      segStart += segs[segIndex].len;
      segIndex++;
    }
    const seg = segs[segIndex];
    points.push(seg.at(seg.len > 0 ? (d - segStart) / seg.len : 0));
  }
  return { points, total };
}

// Hash thuần (không state) cho kiểu "twinkle" — cùng (bóng, nhịp) luôn ra cùng giá trị.
function hash(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Độ sáng 0..1 của bóng thứ i tại thời điểm `phase` (= elapsedMs / stepMs, tính theo nhịp).
function brightness(pattern: MarqueeLightsProps["pattern"], i: number, phase: number): number {
  if (pattern === "alternate") return (i + Math.floor(phase)) % 2 === 0 ? 1 : 0;
  if (pattern === "twinkle") {
    // Mỗi bóng lệch pha riêng (không đổi trạng thái đồng loạt), mỗi "nhịp riêng" dài 2 nhịp chung;
    // bóng được chọn sáng thì sáng lên rồi tắt dần mượt theo nửa sóng sin.
    const local = phase / 2 + hash(i, 0) * 4;
    const n = Math.floor(local);
    return hash(i, n) > 0.55 ? Math.sin((local - n) * Math.PI) : 0;
  }
  // chase: cứ 3 bóng sáng 1, "đầu" đang sáng tiến theo chiều kim đồng hồ, kéo 1 đuôi mờ dần 2 bóng.
  const d = (((phase - i) % 3) + 3) % 3;
  return d < 1 ? 1 - d * 0.5 : d < 2 ? 0.5 - (d - 1) * 0.5 : 0;
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, props: MarqueeLightsProps, elapsedMs: number) {
  const r = Math.max(2, props.bulbSize);
  // Lùi đường viền vào trong đủ chỗ cho quầng sáng — bóng sát mép khung không bị canvas cắt.
  const m = r * HALO_SCALE;
  const perimeter = perimeterPoints(m, m, w - m, h - m, props.cornerRadius, 0).total;
  // Làm tròn số bóng về số CHẴN để "alternate" khép kín vòng (bóng cuối và bóng đầu không cùng pha).
  const count = Math.max(4, Math.round(perimeter / Math.max(r * 2.5, props.spacing) / 2) * 2);
  const bulbs = perimeterPoints(m, m, w - m, h - m, props.cornerRadius, count).points;
  const colors = props.colors.length ? props.colors : ["#FFFFFF"];
  const phase = elapsedMs / Math.max(30, props.stepMs);

  ctx.clearRect(0, 0, w, h);

  // Lớp 1: kính bóng lúc tắt (màu đặc mờ) — vẽ cho MỌI bóng để bóng đang sáng cũng có "thân" rõ nét.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = OFF_ALPHA;
  for (let i = 0; i < bulbs.length; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(bulbs[i][0], bulbs[i][1], r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lớp 2: bóng đang sáng — dán sprite quầng sáng, cộng sáng, alpha = độ sáng.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < bulbs.length; i++) {
    const b = brightness(props.pattern, i, phase);
    if (b <= 0.01) continue;
    const sprite = bulbSprite(colors[i % colors.length], r);
    ctx.globalAlpha = b;
    ctx.drawImage(sprite, bulbs[i][0] - sprite.width / 2, bulbs[i][1] - sprite.height / 2);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// `animate` CHỈ true ở Present Mode thật — Builder/LandingPage.tsx chỉ vẽ 1 khung tĩnh (docs/landing/
// effects.md mục 2). data/builderPreview/resetSeq CHỈ dùng khi `props.syncWithDraw` bật — cùng cơ chế
// ImageView.tsx/OrbitLightsView.tsx.
export default function MarqueeLightsView({
  component,
  animate,
  data,
  builderPreview,
  resetSeq,
}: {
  component: MarqueeLightsComponent;
  animate?: boolean;
  data?: LandingData;
  builderPreview?: boolean;
  resetSeq?: number;
}) {
  const { syncWithDraw, drawCycle } = component.props;
  const latest = data?.results[0];
  // Lọc theo Prize đã gán (nếu có) + chỉ lượt LIVE — xem drawCycleResultId trong types.ts.
  const liveResultId = drawCycleResultId(latest, drawCycle);
  const { shown, transitionClass } = useDrawCycleVisibility(liveResultId, drawCycle ?? DEFAULT_DRAW_CYCLE, resetSeq);
  const visible = !syncWithDraw || builderPreview || shown;

  return visible ? (
    <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
      <MarqueeLightsCanvas component={component} animate={animate} />
    </div>
  ) : null;
}

function MarqueeLightsCanvas({ component, animate }: { component: MarqueeLightsComponent; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Giữ mốc thời gian qua các lần effect chạy lại (Present Mode poll config mỗi 2s) — nhịp đèn không
  // bị giật về nhịp 0.
  const startRef = useRef<number | null>(null);
  const { width, height, props } = component;
  const propsKey = JSON.stringify(props);

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
    // `props` so sánh theo nội dung qua propsKey (poll 2s ra object mới dù không đổi gì).
  }, [animate, width, height, propsKey]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
