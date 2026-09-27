import { useEffect, useRef } from "react";
import {
  DEFAULT_DRAW_CYCLE,
  FireworksComponent,
  FireworksProps,
  drawCycleResultId,
  LandingData,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";
import { Rng, seededRng } from "./seededRng";

// Vật lý pháo hoa 2 pha (quả pháo bay lên để lại vệt → nổ thành chùm tia, ~1/3 tia rơi tàn kiểu
// "willow") — viết lại từ FireworksView.tsx cũ (gỡ cùng Trigger Graph, xem lịch sử git) theo khuôn
// Orbit Lights: 1 "show" thuần tách update (step) khỏi vẽ (draw), dùng chung cho khung tĩnh Builder
// (mô phỏng trước vài giây bằng RNG có seed) lẫn rAF ở Present Mode.

const GRAVITY = 240; // px/s² kéo tia rơi sau khi nổ — quả pháo lúc bay lên dùng gia tốc riêng
const BASE_BURST_SPEED = 520; // px/s tốc độ văng tối đa của tia khi burstSize = 100%
const MAX_PARTICLES = 4000; // chặn trên an toàn nếu đặt interval quá nhỏ + sparkCount quá lớn
const PREVIEW_SIMULATE_S = 3.2; // khung tĩnh Builder = trạng thái sau ngần này giây bắn
const ROCKET_TRAIL_POINTS = 14; // số vị trí gần nhất của quả pháo giữ lại để vẽ vệt liền
const SPARK_STREAK_S = 0.045; // độ dài vệt của tia = vận tốc × ngần này giây (tia nhanh = vệt dài)
// Tàn rơi kiểu có sức cản không khí: vận tốc tiến dần về tốc độ giới hạn thấp (không tăng mãi theo
// trọng lực) — hệ số EMBER_DRAG càng lớn càng nhanh chạm tốc độ giới hạn.
const EMBER_TERMINAL_VY = 22; // px/s
const EMBER_DRAG = 3; // 1/s

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ascentGravity: number; // riêng lúc bay lên — suy ngược từ launchHeight để chắc chắn nổ đúng độ cao
  color: string;
  trail: [number, number][]; // vị trí gần nhất, cũ → mới
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  twinkleSeed: number;
  hasEmbers: boolean;
  emberAccMs: number;
}
// Hạt tàn — rơi chậm lơ lửng rồi tắt, không va chạm gì.
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function createShow(getProps: () => FireworksProps, width: number, height: number, rng: Rng) {
  let rockets: Rocket[] = [];
  let sparks: Spark[] = [];
  let embers: Ember[] = [];
  let elapsedMs = 0;
  let untilNextLaunchMs = 0; // quả đầu bắn ngay
  let sideToggle = false;

  function pickColor(colors: string[]): string {
    return colors.length ? colors[Math.floor(rng() * colors.length)] : "#FFFFFF";
  }

  // Độ cao bay lên chọn TRỰC TIẾP từ launchHeight: chọn trước thời gian lên đỉnh (riseTime) rồi suy ra
  // gia tốc + vận tốc đầu để đúng lúc vận tốc = 0 thì vừa tới độ cao đó (d = a·t²/2, v0 = a·t).
  function spawnRocket(props: FireworksProps) {
    let originX: number;
    let angleDeg: number;
    if (props.launchFrom === "sides") {
      sideToggle = !sideToggle;
      originX = sideToggle ? width * 0.08 : width * 0.92;
      angleDeg = -90 + (sideToggle ? 1 : -1) * (18 + rng() * 8);
    } else if (props.launchFrom === "center") {
      originX = width * (0.5 + (rng() - 0.5) * 0.2);
      angleDeg = -90 + (rng() - 0.5) * 20;
    } else {
      originX = width * (0.1 + rng() * 0.8);
      angleDeg = -90 + (rng() - 0.5) * 10;
    }
    const heightRatio = Math.min(0.95, Math.max(0.1, props.launchHeight / 100));
    const riseDist = height * heightRatio * (0.85 + rng() * 0.3);
    const riseTime = 0.9 + rng() * 0.4;
    const ascentGravity = (2 * riseDist) / (riseTime * riseTime);
    const speed = ascentGravity * riseTime;
    const angle = deg2rad(angleDeg);
    // vy = -speed dù bắn nghiêng (góc chỉ quyết định vx) — độ cao đỉnh luôn đúng riseDist.
    rockets.push({
      x: originX,
      y: height + 10,
      vx: Math.cos(angle) * speed,
      vy: -speed,
      ascentGravity,
      color: pickColor(props.colors),
      trail: [],
    });
  }

  function explode(x: number, y: number, color: string, props: FireworksProps) {
    const count = Math.max(6, Math.min(400, Math.round(props.sparkCount)));
    const maxSpeed = (BASE_BURST_SPEED * Math.max(10, props.burstSize)) / 100;
    for (let i = 0; i < count && sparks.length < MAX_PARTICLES; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = maxSpeed * (0.4 + rng() * 0.6);
      const life = 1 + rng() * 0.9;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + rng() * 2.5,
        // 1/5 tia trắng xen giữa — lấp lánh, không đơn sắc tuyệt đối như pháo hoa thật.
        color: rng() < 0.2 ? "#FFFFFF" : color,
        life,
        maxLife: life,
        twinkleSeed: rng() * Math.PI * 2,
        hasEmbers: rng() < 0.35,
        emberAccMs: 0,
      });
    }
  }

  function step(dt: number) {
    const props = getProps();
    elapsedMs += dt * 1000;

    untilNextLaunchMs -= dt * 1000;
    if (untilNextLaunchMs <= 0) {
      spawnRocket(props);
      const interval = Math.max(150, props.launchIntervalMs);
      untilNextLaunchMs = interval * (0.7 + rng() * 0.6);
    }

    rockets = rockets.filter((r) => {
      r.vy += r.ascentGravity * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.trail.push([r.x, r.y]);
      if (r.trail.length > ROCKET_TRAIL_POINTS) r.trail.shift();
      if (r.vy >= 0) {
        explode(r.x, r.y, r.color, props);
        return false;
      }
      return true;
    });

    sparks = sparks.filter((s) => {
      s.vy += GRAVITY * dt;
      s.vx *= 1 - 0.6 * dt;
      s.vy *= 1 - 0.15 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const alive = s.life > 0 && s.y < height + 40;
      // Tàn rơi thưa dần khi tia sắp tắt — không đổ ồ ạt đúng lúc tia vừa tắt hẳn.
      if (alive && s.hasEmbers && s.life / s.maxLife > 0.15 && embers.length < MAX_PARTICLES) {
        s.emberAccMs += dt * 1000;
        if (s.emberAccMs > 55) {
          s.emberAccMs = 0;
          // Sống lâu hơn tia 1 chút để kịp thấy trôi lơ lửng; thừa hưởng 1 phần nhỏ quán tính của tia.
          const life = 0.7 + rng() * 0.6;
          embers.push({
            x: s.x,
            y: s.y,
            vx: s.vx * 0.1,
            vy: s.vy * 0.1 + 10,
            size: 1 + rng() * 1.2,
            color: s.color,
            life,
            maxLife: life,
          });
        }
      }
      return alive;
    });

    const emberDamp = 1 - Math.exp(-EMBER_DRAG * dt);
    embers = embers.filter((e) => {
      e.vx -= e.vx * emberDamp;
      e.vy += (EMBER_TERMINAL_VY - e.vy) * emberDamp;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.life -= dt;
      return e.life > 0;
    });
  }

  // Vệt thẳng + quầng: 1 nét rộng mờ (quầng sáng) rồi 1 nét mảnh đậm (lõi). Không dùng shadowBlur cho
  // tia/tàn — hàng trăm hạt × shadowBlur mỗi khung hình là phần đắt nhất của Canvas 2D; cộng sáng
  // ("lighter") 2 nét đã đủ ra cảm giác phát sáng.
  function streak(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size: number, color: string, alpha: number) {
    const a = Math.max(0, Math.min(1, alpha));
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.globalAlpha = a * 0.18;
    ctx.lineWidth = size * 3;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = size;
    ctx.stroke();
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    // Vệt tàn tối thiểu 1.5px để tàn gần đứng yên vẫn thành 1 chấm nhỏ, không biến mất.
    for (const e of embers) {
      const len = Math.max(1.5, Math.hypot(e.vx, e.vy) * 0.06);
      const speed = Math.max(1, Math.hypot(e.vx, e.vy));
      streak(ctx, e.x - (e.vx / speed) * len, e.y - (e.vy / speed) * len, e.x, e.y, e.size, e.color, (e.life / e.maxLife) * 0.7);
    }
    for (const s of sparks) {
      const twinkle = 0.7 + 0.3 * Math.sin(elapsedMs * 0.02 + s.twinkleSeed);
      const tx = s.x - s.vx * SPARK_STREAK_S;
      const ty = s.y - s.vy * SPARK_STREAK_S;
      streak(ctx, tx, ty, s.x, s.y, s.size, s.color, (s.life / s.maxLife) * twinkle);
    }
    // Quả pháo: vệt liền qua các vị trí gần nhất (đoạn cũ mờ + mảnh hơn), đầu có glow shadowBlur (chỉ
    // vài quả cùng lúc nên rẻ).
    ctx.lineCap = "butt";
    for (const r of rockets) {
      for (let i = 1; i < r.trail.length; i++) {
        const f = i / r.trail.length;
        const [x0, y0] = r.trail[i - 1];
        const [x1, y1] = r.trail[i];
        streak(ctx, x0, y0, x1, y1, 1 + 2.5 * f, r.color, f * 0.9);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 16;
      ctx.shadowColor = r.color;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  return { step, draw };
}

// `animate` CHỈ true ở Present Mode thật — Builder/LandingPage.tsx chỉ vẽ 1 khung tĩnh (docs/landing/
// effects.md mục 2). data/builderPreview/resetSeq CHỈ dùng khi `props.syncWithDraw` bật — cùng cơ chế
// ImageView.tsx/OrbitLightsView.tsx.
export default function FireworksView({
  component,
  animate,
  data,
  builderPreview,
  resetSeq,
}: {
  component: FireworksComponent;
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
  // Lúc ẩn thì unmount hẳn canvas → dừng rAF, hiện lại thì bắn lại từ đầu (quả pháo đầu tiên bắn ngay).
  const visible = !syncWithDraw || builderPreview || shown;

  return visible ? (
    <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
      <FireworksCanvas component={component} animate={animate} />
    </div>
  ) : null;
}

function FireworksCanvas({ component, animate }: { component: FireworksComponent; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, props } = component;
  // Present Mode poll lại config mỗi 2s → `props` là object MỚI mỗi lần dù không đổi gì. Deps theo
  // nội dung JSON (propsKey) chứ không theo identity, để show không bị huỷ + bắn lại từ đầu mỗi 2s.
  const propsRef = useRef(props);
  propsRef.current = props;
  const propsKey = JSON.stringify(props);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = width;
    canvas.height = height;

    if (!animate) {
      const show = createShow(() => propsRef.current, width, height, seededRng(1));
      for (let t = 0; t < PREVIEW_SIMULATE_S; t += 1 / 60) show.step(1 / 60);
      show.draw(ctx);
      return;
    }

    const show = createShow(() => propsRef.current, width, height, Math.random);
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      // Chặn dt tối đa 50ms — tab bị treo/ẩn lâu quay lại không làm hạt nhảy cóc.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      show.step(dt);
      show.draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, width, height, propsKey]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
