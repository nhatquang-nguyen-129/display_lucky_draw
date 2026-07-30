import { useEffect, useRef, useState } from "react";
import { DrawSequenceActions, FireworksComponent, FireworksProps } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

const PALETTES: Record<FireworksProps["colorPalette"], string[]> = {
  brand: ["#2244A5", "#20C7F1", "#FFCA2D"],
  gold: ["#FFCA2D", "#FFE58A", "#B8860B", "#FFFFFF"],
  rainbow: ["#FF5252", "#FFB300", "#FFEE58", "#66BB6A", "#42A5F5", "#AB47BC"],
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotSpeed: number;
  shape: 0 | 1;
  life: number;
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function randomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

// Vật lý hạt cho từng preset — chuyển thể trực tiếp từ ConfettiBurst.tsx (đã xoá, hiệu ứng giờ là 1
// Component thật thay vì reaction gắn vào Background), tham số hoá theo FireworksProps thay vì hằng
// số cứng/enum density-preset cũ.
function spawnParticle(props: FireworksProps, width: number, height: number, colors: string[]): Particle {
  const color = randomColor(colors);
  const shape: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  const size = 6 + Math.random() * 6;
  const rotation = Math.random() * Math.PI * 2;
  const rotSpeed = (Math.random() - 0.5) * 6;
  const speedMag = props.speed * (0.4 + Math.random() * 0.6);

  if (props.preset === "rain") {
    const drift = (props.spreadAngle / 360) * 80;
    return {
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * drift,
      vy: speedMag * 0.35 + Math.random() * speedMag * 0.25,
      size,
      color,
      rotation,
      rotSpeed,
      shape,
      life: 8,
    };
  }

  if (props.preset === "cannons") {
    const fromLeft = Math.random() < 0.5;
    const baseAngle = -Math.PI / 2 + deg2rad(props.launchDirection);
    const spreadRad = deg2rad(props.spreadAngle);
    const side = fromLeft ? -1 : 1;
    const angle = baseAngle + side * spreadRad * 0.35 + (Math.random() - 0.5) * spreadRad * 0.3;
    return {
      x: fromLeft ? width * 0.04 : width * 0.96,
      y: height * 0.95,
      vx: Math.cos(angle) * speedMag,
      vy: Math.sin(angle) * speedMag,
      size,
      color,
      rotation,
      rotSpeed,
      shape,
      life: 4,
    };
  }

  // burstCenter — spreadAngle=360 (mặc định) toả tròn đều quanh launchDirection, hẹp lại nếu spreadAngle nhỏ hơn.
  const angle = deg2rad(props.launchDirection) + (Math.random() - 0.5) * deg2rad(props.spreadAngle);
  const radiusOffset = Math.random() * props.burstRadius;
  return {
    x: width / 2 + Math.cos(angle) * radiusOffset,
    y: height / 2 + Math.sin(angle) * radiusOffset,
    vx: Math.cos(angle) * speedMag,
    vy: Math.sin(angle) * speedMag * 0.6 - speedMag * 0.3,
    size,
    color,
    rotation,
    rotSpeed,
    shape,
    life: 4,
  };
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  else {
    ctx.beginPath();
    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Canvas engine thật — chỉ chạy khi `active` (đã nhận lệnh "Fireworks.Play" và chưa "Fireworks.Stop").
// Tự lặp lại mỗi `duration` ms nếu `loop`, dừng hẳn (unmount, không còn hạt nào) khi bị
// "Fireworks.Stop" hoặc hết 1 lượt không loop.
function FireworksCanvas({ width, height, props }: { width: number; height: number; props: FireworksProps }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const colors = PALETTES[props.colorPalette];
    const totalCount = Math.max(1, Math.round(props.particleCount));
    let particles: Particle[] =
      props.preset === "rain" ? [] : Array.from({ length: totalCount }, () => spawnParticle(props, width, height, colors));

    const maxElapsedMs = props.duration > 0 ? props.duration : Infinity;
    const spawnIntervalMs = props.preset === "rain" ? 1000 / (totalCount / 3) : Infinity;
    let elapsedMs = 0;
    let spawnAccMs = 0;
    let lastTs = performance.now();
    let raf = 0;

    function frame(ts: number) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      elapsedMs += dt * 1000;

      if (props.preset === "rain" && elapsedMs < maxElapsedMs) {
        spawnAccMs += dt * 1000;
        while (spawnAccMs > spawnIntervalMs) {
          spawnAccMs -= spawnIntervalMs;
          if (particles.length < totalCount * 3) particles.push(spawnParticle(props, width, height, colors));
        }
      }

      ctx!.clearRect(0, 0, width, height);
      particles = particles.filter((p) => {
        p.vy += props.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotSpeed * dt;
        p.life -= dt;
        const alive = p.y < height + 30 && p.life > 0;
        if (alive) drawParticle(ctx!, p);
        return alive;
      });

      const stillSpawning = props.preset === "rain" && elapsedMs < maxElapsedMs;
      if (particles.length > 0 || stillSpawning) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, props]);

  return <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none absolute inset-0" />;
}

// Khung tĩnh (1 khung hình, không animation) hiện trong Builder — cho người dùng thấy đại khái vị
// trí/màu sắc/mật độ mà không cần bật Present Mode. Vẽ 1 lần các hạt ở vị trí xuất phát, không mô
// phỏng vật lý.
function FireworksPreview({ width, height, props }: { width: number; height: number; props: FireworksProps }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const colors = PALETTES[props.colorPalette];
    const count = Math.min(60, Math.max(1, Math.round(props.particleCount)));
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < count; i++) {
      drawParticle(ctx, spawnParticle(props, width, height, colors));
    }
  }, [width, height, props]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 opacity-70"
    />
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
