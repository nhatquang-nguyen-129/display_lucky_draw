// RNG dùng chung cho các effect Canvas 2D có mô phỏng (Fireworks/Confetti/Spark Fountain). Present Mode truyền
// `Math.random`; khung tĩnh Builder truyền seededRng(1) — cùng props luôn ra cùng 1 hình, không nhảy
// lung tung mỗi lần re-render.
export type Rng = () => number;

// mulberry32 — đủ tốt cho hiệu ứng hình ảnh, không dùng cho gì cần ngẫu nhiên "thật" (vd Draw Engine).
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
