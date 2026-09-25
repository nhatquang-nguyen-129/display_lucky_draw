import { useEffect, useRef } from "react";
import {
  ConfettiComponent,
  ConfettiProps,
  DEFAULT_DRAW_CYCLE,
  drawCycleResultId,
  LandingData,
} from "@/lib/landing/types";
import { useDrawCycleVisibility } from "./drawRevealHooks";
import { Rng, seededRng } from "./seededRng";

// Pháo giấy — cùng khuôn FireworksView.tsx: 1 "show" thuần tách update (step) khỏi vẽ (draw), dùng
// chung cho khung tĩnh Builder (mô phỏng trước bằng RNG có seed) lẫn rAF ở Present Mode.
//
// Vật lý: mảnh giấy nhẹ, cản gió lớn — bắn ra rất nhanh nhưng mất đà gần như ngay (drag tuyến tính
// mạnh), rồi rơi chậm ở tốc độ giới hạn riêng của từng mảnh, vừa rơi vừa lắc ngang + lật (lật = co
// giãn theo 1 trục, mặt nghiêng thì tối đi) — đúng cảm giác "lả tả" thay vì rơi thẳng như hòn đá.

const GRAVITY = 900; // px/s²
const DRAG = 2.2; // 1/s — cản gió tuyến tính khi mảnh còn bay nhanh
const TERMINAL_MIN = 110; // px/s — tốc độ rơi giới hạn, mỗi mảnh ngẫu nhiên trong khoảng này
const TERMINAL_MAX = 200;
const RAIN_WAVE_S = 2.5; // "top": 1 đợt = pieceCount mảnh rải đều trong ngần này giây
const MAX_PIECES = 3000;

type Shape = "rect" | "circle" | "ribbon";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  terminal: number;
  w: number;
  h: number;
  shape: Shape;
  color: string;
  rot: number; // xoay trong mặt phẳng (rad)
  rotSpeed: number;
  flip: number; // pha lật — cos(flip) = độ "mở" của mặt giấy (0 = nhìn nghiêng)
  flipSpeed: number;
  sway: number; // pha lắc ngang
  swaySpeed: number;
  swayAmp: number; // px/s
}

function createShow(getProps: () => ConfettiProps, width: number, height: number, rng: Rng) {
  let pieces: Piece[] = [];
  let untilNextBurstMs = 0; // đợt đầu bung ngay
  let rainBudget = 0; // số mảnh "top" còn phải rải trong đợt hiện tại (once)
  let rainAcc = 0;
  let started = false;

  function makePiece(x: number, y: number, vx: number, vy: number, props: ConfettiProps): Piece {
    const size = Math.max(4, props.pieceSize) * (0.75 + rng() * 0.5);
    const r = rng();
    const shape: Shape = r < 0.6 ? "rect" : r < 0.8 ? "circle" : "ribbon";
    const [w, h] = shape === "rect" ? [size, size * 0.6] : shape === "circle" ? [size * 0.7, size * 0.7] : [size * 0.3, size * 2];
    const colors = props.colors.length ? props.colors : ["#FFFFFF"];
    return {
      x,
      y,
      vx,
      vy,
      terminal: TERMINAL_MIN + rng() * (TERMINAL_MAX - TERMINAL_MIN),
      w,
      h,
      shape,
      color: colors[Math.floor(rng() * colors.length)],
      rot: rng() * Math.PI * 2,
      rotSpeed: (rng() - 0.5) * 6,
      flip: rng() * Math.PI * 2,
      flipSpeed: 4 + rng() * 8,
      sway: rng() * Math.PI * 2,
      swaySpeed: 1.5 + rng() * 2.5,
      swayAmp: 20 + rng() * 50,
    };
  }

  function add(p: Piece) {
    if (pieces.length < MAX_PIECES) pieces.push(p);
  }

  // Bung 1 đợt từ `center`/`sides`. Tốc độ bắn cao (drag mạnh ăn gần hết ngay) — quãng bay ≈ v/DRAG.
  function burst(props: ConfettiProps) {
    const count = Math.max(10, Math.min(600, Math.round(props.pieceCount)));
    if (props.launchFrom === "center") {
      for (let i = 0; i < count; i++) {
        const angle = ((-90 + (rng() - 0.5) * 110) * Math.PI) / 180;
        const speed = 700 + rng() * 1300;
        add(makePiece(width / 2, height * 0.62, Math.cos(angle) * speed, Math.sin(angle) * speed, props));
      }
      return;
    }
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      // Góc lệch khỏi phương thẳng đứng, nghiêng vào giữa khung 15–50°.
      const tilt = 15 + rng() * 35;
      const angle = ((-90 + (left ? tilt : -tilt)) * Math.PI) / 180;
      const speed = 2000 + rng() * 1600;
      add(makePiece(left ? width * 0.02 : width * 0.98, height + 10, Math.cos(angle) * speed, Math.sin(angle) * speed, props));
    }
  }

  function rainOne(props: ConfettiProps) {
    add(makePiece(rng() * width, -20 - rng() * 40, (rng() - 0.5) * 40, TERMINAL_MIN + rng() * 60, props));
  }

  function step(dt: number) {
    const props = getProps();
    const count = Math.max(10, Math.min(600, Math.round(props.pieceCount)));

    if (props.launchFrom === "top") {
      // once: rải đúng `count` mảnh trong RAIN_WAVE_S rồi thôi; loop: rải liên tục cùng mật độ.
      if (!started) rainBudget = count;
      if (props.playMode === "loop" || rainBudget > 0) {
        rainAcc += (count / RAIN_WAVE_S) * dt;
        while (rainAcc >= 1) {
          rainAcc -= 1;
          if (props.playMode === "once") {
            if (rainBudget <= 0) break;
            rainBudget--;
          }
          rainOne(props);
        }
      }
    } else {
      untilNextBurstMs -= dt * 1000;
      if (untilNextBurstMs <= 0 && (!started || props.playMode === "loop")) {
        burst(props);
        untilNextBurstMs = Math.max(500, props.intervalMs);
      }
    }
    started = true;

    const drag = Math.exp(-DRAG * dt);
    pieces = pieces.filter((p) => {
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * dt;
      // Đã chạm tốc độ rơi giới hạn thì ghim lại — không rơi nhanh dần mãi.
      if (p.vy > p.terminal) p.vy = p.terminal;
      p.sway += p.swaySpeed * dt;
      p.x += (p.vx + Math.sin(p.sway) * p.swayAmp) * dt;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed * dt;
      p.flip += p.flipSpeed * dt;
      return p.y < height + 40 && p.x > -60 && p.x < width + 60;
    });
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const p of pieces) {
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const open = Math.cos(p.flip); // -1..1, đổi dấu = lật sang mặt kia
      // Ma trận = xoay p.rot rồi co trục y theo `open` → mảnh giấy lật quanh trục ngang của chính nó.
      ctx.setTransform(cos, sin, -sin * open, cos * open, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.shape === "circle") ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      else ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.fill();
      // Mặt giấy càng nghiêng (|open| nhỏ) càng tối — tạo cảm giác lật 3D không cần WebGL.
      const shade = (1 - Math.abs(open)) * 0.45;
      if (shade > 0.02) {
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { step, draw };
}

// `animate` CHỈ true ở Present Mode thật — Builder/LandingPage.tsx chỉ vẽ 1 khung tĩnh (docs/landing/
// effects.md mục 2). data/builderPreview/resetSeq CHỈ dùng khi `props.syncWithDraw` bật — cùng cơ chế
// ImageView.tsx/FireworksView.tsx.
export default function ConfettiView({
  component,
  animate,
  data,
  builderPreview,
  resetSeq,
}: {
  component: ConfettiComponent;
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
  // Lúc ẩn thì unmount hẳn canvas → dừng rAF; hiện lại thì mount mới → bung lại 1 đợt từ đầu.
  const visible = !syncWithDraw || builderPreview || shown;

  return visible ? (
    <div className={`h-full w-full ${syncWithDraw && !builderPreview ? transitionClass : ""}`}>
      <ConfettiCanvas component={component} animate={animate} />
    </div>
  ) : null;
}

function ConfettiCanvas({ component, animate }: { component: ConfettiComponent; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, props } = component;
  // Deps theo nội dung JSON, không theo identity — Present Mode poll config mỗi 2s ra object mới, deps
  // theo identity sẽ bung lại đợt mới mỗi 2s (xem cùng lý do ở FireworksView.tsx).
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
      // "top" cần vài giây để mảnh rải kín khung; bung từ dưới thì chụp lúc mảnh đang bay lơ lửng.
      const previewS = propsRef.current.launchFrom === "top" ? 4.5 : 0.9;
      const show = createShow(() => propsRef.current, width, height, seededRng(1));
      for (let t = 0; t < previewS; t += 1 / 60) show.step(1 / 60);
      show.draw(ctx);
      return;
    }

    const show = createShow(() => propsRef.current, width, height, Math.random);
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
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
