import { useEffect, useRef } from "react";
import { DrawSequenceActions, FireworkComponent, LandingData } from "@/lib/landing/types";

// Pháo hoa gắn với ĐÚNG 1 giải, vẽ THƯA/mảnh trong đúng khung width/height của CHÍNH NÓ (không phủ
// toàn màn hình) — xem doc-comment FireworkProps trong types.ts cho ý nghĩa delay/duration/continuous.
//
// Cấu trúc 1 quả pháo (đều lấy màu/opacity từ `color1`/`color2`, KHÔNG có field riêng cho từng lớp —
// giữ Properties Panel gọn, xem FireworkPanel.tsx):
//   - Launch Trail: tia phóng mảnh (color1) từ đáy khung lên điểm nổ, hơi lệch/rung nhẹ.
//   - Burst Core: 1 chấm sáng nhỏ, màu color1 pha trắng (`lighten`), tắt gần như ngay lập tức.
//   - Burst Rays: 6-12 tia mảnh toả đều (color1), NGẮN và tắt nhanh (không rơi tiếp).
//   - Sparks: vài chấm bụi nhỏ rải quanh tâm nổ (color1 pha trắng, mờ hơn rays).
//   - Falling Sparks: 2-6 tia RIÊNG, tồn tại lâu hơn hẳn (color2, mờ), trọng lực nhẹ + cản gió lớn nên
//     rơi rất chậm — đây là phần "tàn pháo" lưu lại sau khi rays/sparks đã tắt hết.
// "Glow" không phải 1 lớp riêng — mọi chấm sáng đều tự có quầng mờ nhẹ qua `drawGlowDot`.
//
// Vị trí bắn chia theo "zone" (lưới 3×2 trong khung — 3 cột × 2 dải độ cao nổ) và tránh lặp lại những
// zone vừa dùng gần đây, phủ khắp khung theo thời gian mà không thành pattern dễ đoán.

const ZONES_X = 3;
const ZONES_Y = 2;
const ZONE_MEMORY = 2; // tránh lặp lại 2 zone vừa dùng gần nhất

const GRAVITY_ROCKET = 900; // px/s² — tia phóng lên nhanh dứt khoát dù khung thường không cao lắm
const RAY_DRAG = 2.4; // cản gió LỚN — tia nổ ban đầu chỉ toả nhanh trong khoảnh khắc ngắn rồi khựng lại, không bay xa
const FALL_GRAVITY = 90; // px/s² — nhẹ, tàn pháo không rơi nhanh dần như vật nặng
const FALL_DRAG = 1.8; // cản gió lớn — tiệm cận vận tốc rơi thấp (~FALL_GRAVITY/FALL_DRAG), đúng vật lý vật nhẹ
const FALL_TURBULENCE = 18; // px/s² — trôi dạt ngang nhẹ trong lúc tàn pháo rơi

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  baseAlpha: number;
  trail: { x: number; y: number }[];
  streak: boolean; // true = vẽ tia (polyline), false = vẽ chấm tròn nhỏ (spark)
  falling: boolean; // true = tàn pháo — vật lý rơi chậm riêng, tồn tại lâu hơn hẳn rays/sparks
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  trail: { x: number; y: number }[];
}

interface Flash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

const rgbCache = new Map<string, [number, number, number]>();
function hexToRgb(hex: string): [number, number, number] {
  const cached = rgbCache.get(hex);
  if (cached) return cached;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  const rgb: [number, number, number] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  rgbCache.set(hex, rgb);
  return rgb;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// Pha 1 màu về phía trắng — dùng cho Burst Core/Sparks (đúng cảm giác "lõi trắng nóng, tia mới mang
// màu" của pháo hoa thật), tránh phải thêm field màu riêng cho 2 lớp này trong Properties Panel.
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function drawGlowDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  ctx.beginPath();
  ctx.fillStyle = rgba(color, alpha * 0.35);
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Chùm tia nhỏ tĩnh (SVG, không animate) — CHỈ dùng làm gợi ý trực quan trong Builder (xem `!sequence`
// bên dưới), không liên quan gì tới engine hạt canvas thật ở Present Mode.
function BurstAccent({ color, opacity, className }: { color: string; opacity: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" className={className} style={{ opacity }}>
      <line x1="12" y1="12" x2="12" y2="3" />
      <line x1="12" y1="12" x2="19" y2="6" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <line x1="12" y1="12" x2="19" y2="18" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <line x1="12" y1="12" x2="5" y2="18" />
      <line x1="12" y1="12" x2="3" y2="12" />
      <line x1="12" y1="12" x2="5" y2="6" />
    </svg>
  );
}

export default function FireworkView({
  component,
  data,
  sequence,
}: {
  component: FireworkComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { prizeId } = component.props;
  const boundPrize = data?.prizes.find((p) => p.id === prizeId) ?? null;
  // ĐÚNG giải này VỪA được Wheel trả về — cùng công thức `justWon` của PrizeImageView.tsx.
  const justWon =
    !!sequence && !!boundPrize && !!sequence.candidate && sequence.candidate.prizeId === boundPrize.id && !sequence.spinning;

  const liveProps = useRef(component.props);
  liveProps.current = component.props;

  // "Cửa sổ đang được phép bắn" — điều khiển hoàn toàn bằng ref (KHÔNG qua React state), để không
  // remount/restart engine hạt (xem effect canvas bên dưới, CHỈ phụ thuộc width/height, không phụ
  // thuộc sequence — poll data mỗi 2s không được làm giật animation đang chạy dở).
  const activeFromRef = useRef(Infinity); // mốc bắt đầu (sau delay) — Infinity = chưa từng thắng lần nào
  const activeUntilRef = useRef<number | null>(0); // null = vô thời hạn (continuous); mốc = duration; 0 = chưa active
  const nextLaunchAtRef = useRef(0);
  const triggerSeedRef = useRef<string | null>(null); // seed đang ăn mừng — dùng để biết "đã quay tiếp" ở mode continuous

  // Bắt đầu 1 cửa sổ ăn mừng MỚI đúng lúc justWon chuyển true cho 1 seed mới (kể cả thắng LẶP LẠI
  // đúng giải này qua Multiple Draw — seed khác thì vẫn tính là 1 lượt mới, reset lại cửa sổ).
  useEffect(() => {
    if (!justWon) return;
    const seed = sequence!.candidate!.seed;
    if (triggerSeedRef.current === seed) return;
    triggerSeedRef.current = seed;
    // Landing lưu TRƯỚC KHI có delayMs/mode/durationMs (bản ambient trước đó chỉ có color1/color2/
    // intervalMs) không có 3 field này trong JSON đã lưu — PHẢI fallback, thiếu bước này
    // `Math.max(0, undefined)` ra NaN, làm activeFromRef "NaN" khiến hiệu ứng KHÔNG BAO GIỜ bắn được
    // nữa (bug thật đã gặp: chọn giải + bấm Draw nhưng không thấy pháo hoa).
    const delayMs = liveProps.current.delayMs ?? 0;
    const mode = liveProps.current.mode ?? "duration";
    const durationMs = liveProps.current.durationMs ?? 4000;
    const now = performance.now();
    const from = now + Math.max(0, delayMs);
    activeFromRef.current = from;
    activeUntilRef.current = mode === "duration" ? from + durationMs : null;
    nextLaunchAtRef.current = from;
  }, [justWon, sequence?.candidate?.seed]);

  // mode "continuous": dừng ngay khi có 1 lượt quay MỚI bất kỳ bắt đầu (candidate đổi seed) — hiệu
  // ứng KHÔNG có giới hạn thời lượng riêng, chỉ dừng theo sự kiện bên ngoài này. Effect NÀY chạy SAU
  // effect ở trên trong cùng 1 lần render (React chạy theo đúng thứ tự khai báo) nên nếu seed mới
  // CHÍNH LÀ lượt thắng tiếp theo của giải này, `triggerSeedRef` đã được cập nhật thành seed đó ở
  // effect trên rồi — so sánh dưới đây tự nhiên KHÔNG dừng nhầm 1 lượt ăn mừng vừa mới bắt đầu.
  useEffect(() => {
    if (liveProps.current.mode !== "continuous") return;
    if (triggerSeedRef.current === null) return;
    if (sequence?.candidate?.seed !== triggerSeedRef.current) {
      activeUntilRef.current = performance.now();
    }
  }, [sequence?.candidate?.seed]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = component.width;
    const height = component.height;
    // Chặn dpr ở 1.5 — hạt vốn đã mờ/glow, không cần độ nét Retina đầy đủ, mà mỗi lệnh fill/stroke
    // phải xử lý gấp bội pixel nếu để dpr nguyên (bug lag thật đã gặp ở bản trước).
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    const flashes: Flash[] = [];
    const recentZones: number[] = [];
    let lastTs = performance.now();
    let rafId: number;

    function pickZone(): number {
      const total = ZONES_X * ZONES_Y;
      const candidates: number[] = [];
      for (let i = 0; i < total; i++) if (!recentZones.includes(i)) candidates.push(i);
      const pool = candidates.length ? candidates : Array.from({ length: total }, (_, i) => i);
      const zone = pool[Math.floor(Math.random() * pool.length)];
      recentZones.push(zone);
      if (recentZones.length > ZONE_MEMORY) recentZones.shift();
      return zone;
    }

    function launchRocket() {
      const zone = pickZone();
      const zx = zone % ZONES_X;
      const zy = Math.floor(zone / ZONES_X);
      const cellW = width / ZONES_X;
      const apexBandH = (height * 0.42) / ZONES_Y; // 2 dải độ cao nổ, nằm trong 42% trên của khung
      const x = cellW * zx + cellW * (0.22 + Math.random() * 0.56);
      const apexY = height * 0.1 + apexBandH * zy + apexBandH * (0.2 + Math.random() * 0.6);
      const apexDist = height - apexY;
      const color = liveProps.current.color1;
      rockets.push({
        x,
        y: height,
        vx: (Math.random() - 0.5) * 18,
        vy: -Math.sqrt(2 * GRAVITY_ROCKET * Math.max(20, apexDist)),
        color,
        trail: [],
      });
    }

    function spawnBurst(x: number, y: number) {
      const { color1, color2 } = liveProps.current;
      const minDim = Math.min(width, height);
      const core = lighten(color1, 0.55);

      flashes.push({ x, y, life: 0, maxLife: 0.12 + Math.random() * 0.06, color: core });

      const rayCount = 6 + Math.round(Math.random() * 6);
      const rayBaseSpeed = minDim * (0.35 + Math.random() * 0.25);
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = rayBaseSpeed * (0.75 + Math.random() * 0.4);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: color1,
          size: 0.7 + Math.random() * 0.5,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.3,
          baseAlpha: 0.32 + Math.random() * 0.16,
          trail: [],
          streak: true,
          falling: false,
        });
      }

      const sparkCount = 3 + Math.round(Math.random() * 7);
      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = minDim * (0.03 + Math.random() * 0.05);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: core,
          size: 0.85 + Math.random() * 0.55,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.25,
          baseAlpha: 0.18 + Math.random() * 0.16,
          trail: [],
          streak: false,
          falling: false,
        });
      }

      const fallingCount = 2 + Math.round(Math.random() * 4);
      for (let i = 0; i < fallingCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = minDim * (0.15 + Math.random() * 0.15);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: color2,
          size: 0.6 + Math.random() * 0.4,
          life: 0,
          maxLife: 1.6 + Math.random() * 1.0,
          baseAlpha: 0.2 + Math.random() * 0.14,
          trail: [],
          streak: true,
          falling: true,
        });
      }
    }

    function tick(ts: number) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      const now = performance.now();

      const until = activeUntilRef.current;
      const active = now >= activeFromRef.current && (until === null || now <= until);
      if (active && now >= nextLaunchAtRef.current) {
        launchRocket();
        const interval = Math.max(400, liveProps.current.intervalMs ?? 1200);
        nextLaunchAtRef.current = now + interval * (0.5 + Math.random() * 1.3);
      }

      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "lighter";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += GRAVITY_ROCKET * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 5) r.trail.shift();

        for (let t = 1; t < r.trail.length; t++) {
          const a = r.trail[t - 1];
          const b = r.trail[t];
          ctx!.beginPath();
          ctx!.strokeStyle = rgba(r.color, (t / r.trail.length) * 0.48);
          ctx!.lineWidth = 1.5;
          ctx!.lineCap = "round";
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }

        if (r.vy >= 0) {
          spawnBurst(r.x, r.y);
          rockets.splice(i, 1);
        }
      }

      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.life += dt;
        if (f.life >= f.maxLife) {
          flashes.splice(i, 1);
          continue;
        }
        const fade = 1 - f.life / f.maxLife;
        drawGlowDot(ctx!, f.x, f.y, 3.2 * fade + 1.5, f.color, fade * 0.6);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.falling) {
          p.vx += (Math.random() - 0.5) * FALL_TURBULENCE * dt;
          p.vy += FALL_GRAVITY * dt;
          const dragMul = Math.exp(-FALL_DRAG * dt);
          p.vx *= dragMul;
          p.vy *= dragMul;
        } else {
          const dragMul = Math.exp(-RAY_DRAG * dt);
          p.vx *= dragMul;
          p.vy *= dragMul;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;

        if (p.streak) {
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 4) p.trail.shift();
        }

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const t = p.life / p.maxLife;
        // Tia/spark ban đầu mờ dần tuyến tính suốt vòng đời ngắn; tàn pháo giữ sáng lâu hơn (70% đầu)
        // rồi mới tàn dần — đúng nhịp "loé lên rồi rơi nhẹ mới tắt hẳn" của tàn pháo thật.
        const fade = p.falling ? (t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1) : 1 - t;
        const alpha = fade * p.baseAlpha;

        if (p.streak) {
          for (let s = 1; s < p.trail.length; s++) {
            const a = p.trail[s - 1];
            const b = p.trail[s];
            ctx!.beginPath();
            ctx!.strokeStyle = rgba(p.color, alpha * (s / p.trail.length));
            ctx!.lineWidth = p.size;
            ctx!.lineCap = "round";
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        } else {
          drawGlowDot(ctx!, p.x, p.y, p.size, p.color, alpha);
        }
      }

      ctx!.globalCompositeOperation = "source-over";
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [component.width, component.height]);

  // Builder (`sequence` undefined) không có justWon nào để mô phỏng — hiện 1 placeholder để còn nhìn
  // thấy/chọn/kéo-thả được, khớp quy ước `interactive ? sequence : undefined` của LandingRenderer.tsx.
  if (!sequence) {
    // CHỈ khung viền nét đứt — KHÔNG phủ nền tối (từng dùng bg-base-900/40, che mất các component
    // khác nằm dưới trong lúc chỉnh sửa, bug thật đã gặp). 2 chùm tia nhỏ ở góc (màu LẤY THẲNG từ
    // color1 đang cấu hình) chỉ để gợi ý "đây là lớp pháo hoa" — không đặt icon to giữa khung, tránh
    // che khuất phần lớn diện tích như bản cũ.
    const accentColor = component.props.color1 || "#F6D98B";
    return (
      <div className="pointer-events-none absolute inset-0 rounded-lg border border-dashed border-base-700">
        <BurstAccent color={accentColor} className="absolute left-2 top-2 h-7 w-7" opacity={0.55} />
        <BurstAccent color={accentColor} className="absolute bottom-2 right-2 h-5 w-5" opacity={0.4} />
        <span className="absolute bottom-1.5 left-2 max-w-[70%] truncate text-[10px] text-base-500">
          {boundPrize ? boundPrize.name : "No prize selected"}
        </span>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="h-full w-full" style={{ width: component.width, height: component.height }} aria-hidden="true" />;
}
