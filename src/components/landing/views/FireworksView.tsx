import { useEffect, useRef, useState } from "react";
import { DrawSequenceActions, FireworksComponent, FireworksProps } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

const PALETTES: Record<FireworksProps["colorPalette"], string[]> = {
  brand: ["#2244A5", "#20C7F1", "#FFCA2D"],
  gold: ["#FFCA2D", "#FFE58A", "#B8860B", "#FFFFFF"],
  rainbow: ["#FF5252", "#FFB300", "#FFEE58", "#66BB6A", "#42A5F5", "#AB47BC"],
};

// Pháo hoa THẬT có 2 pha rõ rệt — quả pháo (rocket) bắn thẳng lên để lại vệt sáng mảnh, tới đỉnh thì
// nổ thành 1 chùm tia (spark) toả tròn rồi rơi/tắt dần. Bản cũ chỉ có 1 loại hạt bắn ra rồi rơi thẳng
// xuống theo trọng lực — đúng vật lý pháo giấy/confetti (xem ConfettiBurst.tsx cũ), không phải pháo
// hoa. 3 kiểu hạt dưới đây map đúng 2 pha đó + hạt vệt sáng (trail) đi kèm rocket lúc đang bay lên.
interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  ascentGravity: number; // trọng lực RIÊNG lúc bay lên — luôn đủ lớn để chắc chắn tới đỉnh rồi nổ, xem spawnRocket
  trailAccMs: number;
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
  hasEmbers: boolean; // ~1/3 số tia để lại vệt tàn nhỏ rơi xuống lúc rơi — không phải tia nào cũng có, giống pháo hoa thật (kiểu "willow")
  emberAccMs: number;
}
interface Trail {
  x: number;
  y: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function randomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

// Bắn 1 quả pháo — điểm xuất phát + góc bay tuỳ preset. "cannons" bắn từ 2 góc dưới, nghiêng vào
// giữa theo launchDirection (đối xứng trái/phải); "burstCenter"/"rain" bắn gần như thẳng đứng từ rải
// rác quanh giữa khung, launchDirection chỉnh độ nghiêng chung nếu muốn. Độ cao bay lên tính RIÊNG
// từ launchHeight (không phụ thuộc speed/gravity nữa — trước đây độ cao là hệ quả gián tiếp của
// speed/gravity, khó chỉnh trực tiếp) — chọn trước thời gian bay lên tới đỉnh (riseTime), rồi suy
// ngược ra vận tốc ban đầu + gia tốc cần thiết để đúng lúc hết riseTime thì cũng vừa lên tới độ cao
// mong muốn (quãng đường d = a*t²/2 lúc vận tốc = 0 ở đỉnh → a = 2d/t², v0 = a*t). speed vẫn giữ
// nguyên vai trò cũ nhưng CHỈ còn áp dụng cho pha nổ (xem explode()), không còn ảnh hưởng độ cao.
function spawnRocket(props: FireworksProps, width: number, height: number, colors: string[]): Rocket {
  const color = randomColor(colors);
  const fromLeft = Math.random() < 0.5;
  const originX =
    props.preset === "cannons" ? (fromLeft ? width * 0.08 : width * 0.92) : width * (0.5 + (Math.random() - 0.5) * 0.55);
  const baseAngleDeg =
    props.preset === "cannons" ? -90 + props.launchDirection * (fromLeft ? 1 : -1) : -90 + props.launchDirection;
  const angle = deg2rad(baseAngleDeg + (Math.random() - 0.5) * 14);

  const riseDist = height * Math.min(1, Math.max(0.05, props.launchHeight)) * (0.9 + Math.random() * 0.2);
  const riseTime = 0.85 + Math.random() * 0.35;
  const ascentGravity = (2 * riseDist) / (riseTime * riseTime);
  const speedMag = ascentGravity * riseTime;

  return {
    x: originX,
    y: height + 10,
    vx: Math.cos(angle) * speedMag,
    vy: Math.sin(angle) * speedMag,
    color,
    ascentGravity,
    trailAccMs: 0,
  };
}

// Nổ 1 quả pháo tại (x,y) thành `count` tia toả tròn đều (hoặc toả theo hình quạt quanh launchDirection
// nếu spreadAngle < 360 — giữ đúng ý nghĩa cũ của launchDirection/spreadAngle, chỉ chuyển từ "hướng
// bắn hạt confetti" sang "hướng toả chùm tia nổ"). speed = tốc độ văng ra ban đầu của tia. burstRadius
// giờ là hệ số "chùm nổ to/nhỏ cỡ nào" (chia 40 — giá trị mặc định trong componentRegistry.ts — để
// burstRadius=40 cho đúng tốc độ văng như đã canh chỉnh, không đổi hành vi của config cũ đã lưu).
function explode(x: number, y: number, count: number, props: FireworksProps, color: string): Spark[] {
  const sparks: Spark[] = [];
  const burstMul = props.burstRadius / 40;
  for (let i = 0; i < count; i++) {
    const angle = deg2rad(props.launchDirection - 90) + (Math.random() - 0.5) * deg2rad(Math.max(1, props.spreadAngle));
    const speedMag = burstMul * props.speed * (0.35 + Math.random() * 0.65) * 0.55;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speedMag,
      vy: Math.sin(angle) * speedMag,
      size: 2 + Math.random() * 2.5,
      // 1/5 tia là trắng sáng thay vì đúng màu quả pháo — vệt lấp lánh xen giữa, giống pháo hoa thật
      // ngoài đời chứ không đơn sắc tuyệt đối.
      color: Math.random() < 0.2 ? "#FFFFFF" : color,
      life: 1 + Math.random() * 0.9,
      maxLife: 0,
      twinkleSeed: Math.random() * Math.PI * 2,
      hasEmbers: Math.random() < 0.35,
      emberAccMs: 0,
    });
    sparks[sparks.length - 1].maxLife = sparks[sparks.length - 1].life;
  }
  return sparks;
}

function drawGlowDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.shadowBlur = size * 3;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Canvas engine thật — chỉ chạy khi `active` (đã nhận lệnh "Fireworks.Play" và chưa "Fireworks.Stop").
// Tự lặp lại mỗi `duration` ms nếu `loop`, dừng hẳn (unmount, không còn hạt nào) khi bị
// "Fireworks.Stop" hoặc hết 1 lượt không loop. "rain" bắn liên tục nhiều quả pháo nhỏ rải rác suốt
// `duration` (giống 1 màn bắn pháo hoa liên hồi); "burstCenter"/"cannons" bắn hết số quả ngay lúc bắt
// đầu (1 quả và 2 quả — trái/phải — theo đúng thứ tự).
function FireworksCanvas({ width, height, props }: { width: number; height: number; props: FireworksProps }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const colors = PALETTES[props.colorPalette];
    const totalCount = Math.max(1, Math.round(props.particleCount));
    const rocketsAtStart = props.preset === "cannons" ? 2 : props.preset === "burstCenter" ? 1 : 0;
    const sparksPerBurst = Math.max(6, Math.round(totalCount / (props.preset === "rain" ? 5 : rocketsAtStart || 1)));

    let rockets: Rocket[] = Array.from({ length: rocketsAtStart }, () => spawnRocket(props, width, height, colors));
    let sparks: Spark[] = [];
    let trails: Trail[] = [];

    const maxElapsedMs = props.duration > 0 ? props.duration : Infinity;
    let elapsedMs = 0;
    let launchAccMs = 0;
    let nextLaunchMs = 300 + Math.random() * 300;
    let lastTs = performance.now();
    let raf = 0;

    function frame(ts: number) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      elapsedMs += dt * 1000;

      if (props.preset === "rain" && elapsedMs < maxElapsedMs) {
        launchAccMs += dt * 1000;
        if (launchAccMs > nextLaunchMs) {
          launchAccMs = 0;
          nextLaunchMs = 300 + Math.random() * 350;
          rockets.push(spawnRocket(props, width, height, colors));
        }
      }

      ctx!.clearRect(0, 0, width, height);

      rockets = rockets.filter((r) => {
        r.vy += r.ascentGravity * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.trailAccMs += dt * 1000;
        if (r.trailAccMs > 16) {
          r.trailAccMs = 0;
          trails.push({ x: r.x, y: r.y, vy: 20, size: 2 + Math.random() * 1.5, color: r.color, life: 0.35, maxLife: 0.35 });
        }
        if (r.vy >= 0) {
          sparks.push(...explode(r.x, r.y, sparksPerBurst, props, r.color));
          return false;
        }
        drawGlowDot(ctx!, r.x, r.y, 4, r.color, 1);
        return true;
      });

      trails = trails.filter((t) => {
        t.y += t.vy * dt;
        t.life -= dt;
        const alive = t.life > 0;
        if (alive) drawGlowDot(ctx!, t.x, t.y, t.size, t.color, t.life / t.maxLife);
        return alive;
      });

      sparks = sparks.filter((s) => {
        s.vy += props.gravity * dt;
        s.vx *= 1 - 0.6 * dt;
        s.vy *= 1 - 0.15 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        const alive = s.life > 0 && s.y < height + 40;
        if (alive) {
          const fade = s.life / s.maxLife;
          const twinkle = 0.7 + 0.3 * Math.sin(elapsedMs * 0.02 + s.twinkleSeed);
          drawGlowDot(ctx!, s.x, s.y, s.size, s.color, fade * twinkle);
          // Vệt tàn nhỏ rơi xuống rồi tắt dần, kiểu pháo hoa "willow" — chỉ 1 phần tia có (hasEmbers),
          // thưa dần khi tia sắp tắt (life/maxLife thấp) để không rơi ồ ạt ngay lúc vừa tắt hẳn.
          if (s.hasEmbers) {
            s.emberAccMs += dt * 1000;
            if (s.emberAccMs > 55 && fade > 0.15) {
              s.emberAccMs = 0;
              const emberLife = 0.35 + Math.random() * 0.3;
              trails.push({
                x: s.x,
                y: s.y,
                vy: s.vy * 0.15 + 40,
                size: 1 + Math.random() * 1.2,
                color: s.color,
                life: emberLife,
                maxLife: emberLife,
              });
            }
          }
        }
        return alive;
      });

      const stillLaunching = props.preset === "rain" && elapsedMs < maxElapsedMs;
      if (rockets.length > 0 || sparks.length > 0 || trails.length > 0 || stillLaunching) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, props]);

  return <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none absolute inset-0" />;
}

// Khung tĩnh (1 khung hình, không animation) hiện trong Builder — cho người dùng thấy đại khái vị
// trí/màu sắc/mật độ mà không cần bật Present Mode. Vẽ thẳng 1 chùm nổ đã toả (bỏ qua pha rocket bay
// lên — 1 khung tĩnh của rocket chỉ là 1 chấm sáng, không nói lên được đây là hiệu ứng pháo hoa).
function FireworksPreview({ width, height, props }: { width: number; height: number; props: FireworksProps }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const colors = PALETTES[props.colorPalette];
    const count = Math.min(120, Math.max(6, Math.round(props.particleCount)));
    ctx.clearRect(0, 0, width, height);
    const centers =
      props.preset === "cannons"
        ? [
            { x: width * 0.28, y: height * 0.4 },
            { x: width * 0.72, y: height * 0.4 },
          ]
        : [{ x: width / 2, y: height * 0.4 }];
    for (const c of centers) {
      const sparks = explode(c.x, c.y, Math.round(count / centers.length), props, randomColor(colors));
      for (const s of sparks) {
        const dist = 0.55; // vẽ tia đã văng ra 1 đoạn thay vì đứng yên tại tâm — giống ảnh chụp giữa lúc nổ
        drawGlowDot(ctx, s.x + s.vx * dist, s.y + s.vy * dist, s.size, s.color, 0.85);
      }
    }
  }, [width, height, props]);

  return (
    <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none absolute inset-0 opacity-80" />
  );
}

interface FireworksViewProps {
  component: FireworksComponent;
  sequence?: DrawSequenceActions;
}

export default function FireworksView({ component, sequence }: FireworksViewProps) {
  const { width, height, props } = component;
  const [playing, setPlaying] = useState(false);

  useTriggerCommands(component.triggerActions, sequence, (command) => {
    setPlaying(command === "Fireworks.Play");
  });

  // loop=true: hết 1 lượt (duration) tự bắn lại lượt kế tiếp cho tới khi nhận lệnh "Fireworks.Stop" — không
  // cần trigger nổ lại, key đổi mỗi lượt để FireworksCanvas remount (bắt đầu lại từ đầu vòng đời).
  const [loopTick, setLoopTick] = useState(0);
  useEffect(() => {
    if (!playing || !props.loop) return;
    const id = setTimeout(() => setLoopTick((n) => n + 1), Math.max(200, props.duration));
    return () => clearTimeout(id);
  }, [playing, props.loop, props.duration, loopTick]);

  if (!sequence) {
    // Builder canvas — không có Present Mode/trigger thật, luôn hiện khung tĩnh.
    return <FireworksPreview width={width} height={height} props={props} />;
  }

  if (!playing) return null;

  return <FireworksCanvas key={loopTick} width={width} height={height} props={props} />;
}
