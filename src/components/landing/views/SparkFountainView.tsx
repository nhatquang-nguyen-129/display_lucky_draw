import { useEffect, useRef } from "react";
import {
  DEFAULT_DRAW_CYCLE,
  drawCycleResultId,
  LandingData,
  SparkFountainComponent,
  SparkFountainProps,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";
import { Rng, seededRng } from "./seededRng";

// Pháo lạnh sân khấu — cùng khuôn FireworksView.tsx: 1 "show" thuần tách update (step) khỏi vẽ
// (draw), dùng chung cho khung tĩnh Builder (mô phỏng trước bằng RNG có seed) lẫn rAF ở Present Mode.
//
// Vật lý: tia bắn lên RẤT nhanh, trọng lực mạnh (tia pháo lạnh nặng hơn tia pháo hoa) — lên đỉnh
// trong ~1s rồi rơi xuống, tắt dần; vận tốc đầu suy ngược từ độ cao mong muốn (v0 = √(2·g·H)) nên
// Height (%) luôn đúng dù khung to/nhỏ.

const GRAVITY = 1400; // px/s²
const DRAG = 0.35; // 1/s — cản nhẹ, để đường rơi hơi cong mềm thay vì parabol cứng
const DRAG_COMPENSATION = 1.12;
const MAX_SPARKS = 3000;
const STREAK_S = 0.028; // độ dài vệt = vận tốc × ngần này giây
const WHITE_HOT_RATIO = 0.25; // tỉ lệ tia trắng nóng xen giữa — lõi cột sáng hơn, lấp lánh hơn
const PREVIEW_SIMULATE_S = 1.8; // khung tĩnh = sau ngần này giây phun — cột đã lên đỉnh + bắt đầu rơi

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

function createShow(getProps: () => SparkFountainProps, width: number, height: number, rng: Rng) {
  let sparks: Spark[] = [];
  let elapsedMs = 0;
  let emitAcc = 0;

  function fountainXs(props: SparkFountainProps): number[] {
    const n = Math.max(1, Math.min(8, Math.round(props.fountainCount)));
    return Array.from({ length: n }, (_, i) => (width * (i + 0.5)) / n);
  }

  function emitting(props: SparkFountainProps): boolean {
    return props.playMode !== "once" || elapsedMs < Math.max(200, props.durationMs);
  }

  function emit(fx: number, props: SparkFountainProps) {
    const target = height * (Math.min(100, Math.max(10, props.height)) / 100) * (0.85 + rng() * 0.2);
    // × DRAG_COMPENSATION: cản gió ăn mất ~1/4 độ cao so với công thức không cản — bù lại để Height (%)
    // khớp với đỉnh cột thật nhìn thấy.
    const v0 = Math.sqrt(2 * GRAVITY * target) * DRAG_COMPENSATION;
    // (rng + rng - 1) ∈ (-1, 1) dồn về 0 — tia tập trung ở lõi cột, thưa dần ra rìa, đúng dáng cột pháo.
    const spreadRad = (Math.max(0, Math.min(45, props.spread)) * Math.PI) / 180;
    const angle = -Math.PI / 2 + (rng() + rng() - 1) * spreadRad;
    const colors = props.colors.length ? props.colors : ["#FFE08A"];
    const life = 1.2 + rng() * 0.9;
    sparks.push({
      x: fx + (rng() - 0.5) * 6,
      y: height + 2,
      vx: Math.cos(angle) * v0,
      vy: Math.sin(angle) * v0,
      size: 1.5 + rng() * 1.8,
      color: rng() < WHITE_HOT_RATIO ? "#FFFFFF" : colors[Math.floor(rng() * colors.length)],
      life,
      maxLife: life,
    });
  }

  function step(dt: number) {
    const props = getProps();
    elapsedMs += dt * 1000;

    if (emitting(props)) {
      const xs = fountainXs(props);
      emitAcc += Math.max(10, props.intensity) * dt;
      while (emitAcc >= 1) {
        emitAcc -= 1;
        for (const fx of xs) if (sparks.length < MAX_SPARKS) emit(fx, props);
      }
    }

    const drag = Math.exp(-DRAG * dt);
    sparks = sparks.filter((s) => {
      s.vx *= drag;
      s.vy = s.vy * drag + GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      return s.life > 0 && s.y < height + 20;
    });
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const props = getProps();
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (const s of sparks) {
      // Mờ dần ở 40% cuối đời; lấp lánh nhẹ theo từng tia (rng mỗi khung hình — Present Mode dùng
      // Math.random nên nhấp nháy thật, khung tĩnh Builder dùng seed nên vẫn ổn định).
      const fade = Math.min(1, s.life / (s.maxLife * 0.4));
      const alpha = fade * (0.7 + 0.3 * rng());
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * STREAK_S, s.y - s.vy * STREAK_S);
      ctx.lineTo(s.x, s.y);
      ctx.globalAlpha = alpha * 0.2;
      ctx.lineWidth = s.size * 3;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = s.size;
      ctx.stroke();
    }

    // Miệng phun: quầng sáng nhỏ ở đáy mỗi cột, chỉ khi đang phun.
    if (emitting(props)) {
      const color = props.colors[0] ?? "#FFE08A";
      ctx.fillStyle = color;
      for (const fx of fountainXs(props)) {
        for (const [r, a] of [
          [34, 0.08],
          [18, 0.18],
          [7, 0.6],
        ] as const) {
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(fx, height, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  return { step, draw };
}

// `animate` CHỈ true ở Present Mode thật — Builder/LandingPage.tsx chỉ vẽ 1 khung tĩnh (docs/landing/
// effects.md mục 2). data/builderPreview/resetSeq CHỈ dùng khi `props.syncWithDraw` bật — cùng cơ chế
// ImageView.tsx/FireworksView.tsx.
export default function SparkFountainView({
  component,
  animate,
  data,
  builderPreview,
  resetSeq,
}: {
  component: SparkFountainComponent;
  animate?: boolean;
  data?: LandingData;
  builderPreview?: boolean;
  resetSeq?: number;
}) {
  const { syncWithDraw, drawCycle } = component.props;
  // Lọc theo Prize đã gán (nếu có) + chỉ lượt LIVE — xem drawCycleResultId trong types.ts.
  const liveResultId = drawCycleResultId(data?.results[0], drawCycle);
  const { shown, transitionClass } = useDrawCycleVisibility(liveResultId, drawCycle ?? DEFAULT_DRAW_CYCLE, resetSeq);
  // Lúc ẩn thì unmount hẳn canvas → dừng rAF; hiện lại thì mount mới → phun lại từ đầu.
  const visible = !syncWithDraw || builderPreview || shown;

  return visible ? (
    <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
      <SparkFountainCanvas component={component} animate={animate} />
    </div>
  ) : null;
}

function SparkFountainCanvas({ component, animate }: { component: SparkFountainComponent; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, props } = component;
  // Deps theo nội dung JSON, không theo identity — Present Mode poll config mỗi 2s ra object mới, deps
  // theo identity sẽ huỷ + phun lại từ đầu mỗi 2s (xem cùng lý do ở FireworksView.tsx).
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
      // Chặn dt tối đa 50ms — tab bị treo/ẩn lâu quay lại không làm tia nhảy cóc.
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
