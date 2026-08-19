import { useEffect, useRef } from "react";
import { FireworkLaunch, subscribeFirework } from "./fireworkCoordinator";

// Vật lý pháo hoa — thuần Canvas 2D (không thêm thư viện đồ hoạ mới), tất cả tính bằng giây (dt) để
// chạy đúng tốc độ bất kể khung hình/giây thực tế của máy. 2 pha tách biệt:
//   - Rocket (đang bay lên): gia tốc âm nhỏ để lên chậm rãi ~1-1.4s rồi NỔ đúng lúc đảo chiều rơi
//     xuống (vy >= 0) — không nổ ở 1 độ cao cố định, tự nhiên hơn vì mỗi quả bay hơi khác nhau.
//   - Particle (mảnh nổ): trọng lực + lực cản không khí (drag) kéo chậm dần, mờ dần theo `life/maxLife`,
//     1 phần nhỏ tự "nổ phụ" (crackle) giữa vòng đời thành vài mảnh nhỏ hơn — bắt chước pháo hoa
//     "willow/crackle" thật ngoài đời thay vì mọi quả đều nổ 1 lớp giống hệt nhau.
// Vẽ bằng `clearRect` MỖI FRAME (không để lại vệt mờ dần kiểu "phơi sáng" bằng cách phủ đen bán trong
// suốt) — landing thật có nền là ảnh/thương hiệu của sự kiện, phủ đen dần lên TOÀN màn hình mỗi frame
// sẽ làm tối luôn cả nền thật đằng sau, không chỉ vệt pháo hoa. Trail được vẽ THỦ CÔNG bằng cách lưu
// vài vị trí gần nhất rồi nối polyline mờ dần, giữ đúng hiệu ứng vệt sáng mà không đụng gì tới nền.
// `globalCompositeOperation = "lighter"` (cộng màu) khi vẽ mọi hạt sáng — mô phỏng ánh sáng thật cộng
// dồn khi nhiều tia đè lên nhau, đúng cảm giác pháo hoa "phát sáng" thay vì hình phẳng tô màu.

const GRAVITY_ROCKET = 340; // px/s² — kéo rocket chậm dần khi bay lên, nổ tự nhiên lúc hết đà
const GRAVITY_PARTICLE = 260; // px/s² — nhẹ hơn 1 chút để mảnh nổ "lơ lửng" trước khi rơi, giống pháo hoa thật
const DRAG = 1.1; // hệ số cản không khí (áp dụng dạng e^-DRAG*dt) — càng lớn mảnh nổ càng chậm nhanh

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color1: string;
  color2: string;
  trail: { x: number; y: number }[];
}

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  streak: boolean; // vẽ thành vệt (đường) thay vì chấm tròn — vài tia bay xa trông như tia lửa thật
  crackle: boolean; // giữa vòng đời tự nổ phụ thành vài mảnh nhỏ hơn (kiểu pháo hoa "crackle")
  crackled: boolean;
}

interface PendingLaunch {
  fireAt: number; // performance.now() mốc thời gian THẬT sẽ bắn
  x: number;
  targetY: number;
  color1: string;
  color2: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// 42% màu 1 / 42% màu 2 / 16% trắng (lõi lấp lánh, kiểu "kim cương" hay thấy giữa các cụm pháo hoa
// nhiều màu thật) — tránh mọi mảnh nổ đều đúng 1 trong 2 màu cấu hình, trông đơn điệu hơn thật.
function pickParticleColor(color1: string, color2: string): string {
  const r = Math.random();
  if (r < 0.42) return color1;
  if (r < 0.84) return color2;
  return "#FFFFFF";
}

function spawnBurst(particles: Particle[], x: number, y: number, color1: string, color2: string, scale = 1) {
  const count = Math.round((70 + Math.random() * 40) * scale);
  const baseSpeed = 90 + Math.random() * 60;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // 0.7-1.2x baseSpeed — vỏ cầu có độ dày thay vì 1 vòng tròn rỗng hoàn hảo hoặc đặc kín, giống
    // ảnh chụp pháo hoa thật (có độ sâu nhưng vẫn thấy rõ hình cầu).
    const speed = baseSpeed * (0.7 + Math.random() * 0.5);
    particles.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: pickParticleColor(color1, color2),
      size: 1.3 + Math.random() * 1.3,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.7,
      streak: Math.random() < 0.3,
      crackle: scale === 1 && Math.random() < 0.12, // mảnh nổ phụ (scale<1) không tự crackle tiếp — tránh đệ quy
      crackled: false,
    });
  }
}

function drawGlowDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  // Quầng sáng ngoài (bán kính lớn, alpha thấp) + lõi sáng trong (bán kính thật, alpha cao) — 2 lớp
  // hình tròn thường này rẻ hơn NHIỀU so với `ctx.shadowBlur` trên hàng trăm hạt mỗi frame, mà cộng
  // màu (globalCompositeOperation lighter) vẫn cho cảm giác phát sáng tương đương khi nhiều hạt đè nhau.
  ctx.beginPath();
  ctx.fillStyle = rgba(color, alpha * 0.35);
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Overlay toàn màn hình (position: fixed) — mount 1 LẦN ở PresentMode.tsx, NGOÀI canvas đã scale của
// LandingRenderer.tsx (xem doc-comment onWonFirework trong types.ts) nên toạ độ vẽ ở đây LUÔN là pixel
// màn hình thật, không cần biết gì về `scale`/CANVAS_WIDTH của landing. `pointer-events: none` tuyệt
// đối — không bao giờ được chặn click vào bất kỳ thứ gì bên dưới.
export default function FireworkOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    const pending: PendingLaunch[] = [];
    let rafId: number | null = null;
    let lastTs = 0;

    function scheduleLaunch(launch: FireworkLaunch) {
      const now = performance.now();
      const count = Math.max(1, Math.round(launch.burstCount));
      const span = Math.max(200, launch.durationMs);
      for (let i = 0; i < count; i++) {
        // Rải đều theo `span` + jitter ngẫu nhiên mỗi đợt — bắn đúng nhịp cách đều tuyệt đối trông giả
        // tạo, jitter cho cảm giác 1 dàn pháo hoa thật đang bắn liên tục chứ không phải máy đếm nhịp.
        const delay = (span / count) * i + Math.random() * (span / count) * 0.6;
        pending.push({
          fireAt: now + delay,
          x: width * (0.15 + Math.random() * 0.7),
          targetY: height * (0.2 + Math.random() * 0.32),
          color1: launch.color1,
          color2: launch.color2,
        });
      }
      if (rafId === null) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    function tick(ts: number) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      const now = performance.now();

      // Bắn đợt nào tới giờ — tách khỏi rocket bay lên như 1 hạt sáng trắng-vàng (ember), màu thật của
      // đợt nổ chỉ lộ ra lúc nổ, đúng cảm giác pháo hoa thật (đuôi lửa lúc bay lên luôn trắng/vàng bất
      // kể màu sẽ nổ ra).
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].fireAt > now) continue;
        const p = pending[i];
        const launchY = height + 4;
        const apexDist = launchY - p.targetY;
        rockets.push({
          x: p.x,
          y: launchY,
          vx: (Math.random() - 0.5) * 40,
          vy: -Math.sqrt(2 * GRAVITY_ROCKET * apexDist),
          color1: p.color1,
          color2: p.color2,
          trail: [],
        });
        pending.splice(i, 1);
      }

      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "lighter";

      // Rocket — cập nhật vật lý, vẽ vệt đuôi (polyline mờ dần từ vài vị trí gần nhất) + đầu sáng.
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += GRAVITY_ROCKET * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 7) r.trail.shift();

        for (let t = 1; t < r.trail.length; t++) {
          const a = r.trail[t - 1];
          const b = r.trail[t];
          const alpha = (t / r.trail.length) * 0.5;
          ctx!.beginPath();
          ctx!.strokeStyle = rgba("#FFE9A8", alpha);
          ctx!.lineWidth = 1.6;
          ctx!.lineCap = "round";
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
        drawGlowDot(ctx!, r.x, r.y, 2.2, "#FFF6D8", 0.95);

        if (r.vy >= 0) {
          spawnBurst(particles, r.x, r.y, r.color1, r.color2);
          rockets.splice(i, 1);
        }
      }

      // Particle — trọng lực + drag, crackle giữa vòng đời, vẽ chấm sáng hoặc vệt tia tuỳ loại.
      const dragMul = Math.exp(-DRAG * dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.prevX = p.x;
        p.prevY = p.y;
        p.vy += GRAVITY_PARTICLE * dt;
        p.vx *= dragMul;
        p.vy *= dragMul;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;

        if (p.crackle && !p.crackled && p.life > p.maxLife * 0.4 && p.life < p.maxLife * 0.6) {
          spawnBurst(particles, p.x, p.y, p.color, p.color, 0.22);
          p.crackled = true;
        }

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const fade = 1 - p.life / p.maxLife;
        // Lấp lánh nhẹ (twinkle) cho hạt dạng chấm — nhân alpha với 1 dao động ngẫu nhiên nhỏ mỗi
        // frame, mô phỏng ánh kim loại cháy lập loè thay vì mờ dần tuyệt đối tuyến tính.
        const twinkle = p.streak ? 1 : 0.75 + Math.random() * 0.25;
        const alpha = fade * fade * twinkle;

        if (p.streak) {
          ctx!.beginPath();
          ctx!.strokeStyle = rgba(p.color, alpha);
          ctx!.lineWidth = p.size;
          ctx!.lineCap = "round";
          ctx!.moveTo(p.prevX, p.prevY);
          ctx!.lineTo(p.x, p.y);
          ctx!.stroke();
        } else {
          drawGlowDot(ctx!, p.x, p.y, p.size, p.color, alpha);
        }
      }

      ctx!.globalCompositeOperation = "source-over";

      if (rockets.length === 0 && particles.length === 0 && pending.length === 0) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    const unsubscribe = subscribeFirework(scheduleLaunch);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-40"
      aria-hidden="true"
    />
  );
}
