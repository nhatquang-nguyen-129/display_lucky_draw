import { useEffect, useState } from "react";
import { FrameMaskDetect } from "./types";

// Xử lý ảnh pixel map PNG của Output Frame (shape "image") thành 2 lớp phủ — THUẦN Canvas 2D, không thêm
// thư viện (xem CLAUDE.md "Định hướng công nghệ"):
//   - outlineUrl: dải viền vàng bám mép vùng LED (nằm TRONG vùng LED, giống nét khung chữ nhật).
//   - outsideUrl: đen đặc ở phần NGOÀI vùng LED, trong suốt bên trong — OutputFrameView đặt opacity để
//     làm tối phần sẽ bị cắt.
// Chạy 1 lần cho mỗi (ảnh + tuỳ chọn), cache theo key, Builder/Present/Properties Panel dùng chung kết
// quả. Xem docs/landing/output-frame.md.

export interface FrameMaskOptions {
  detect: FrameMaskDetect;
  invert: boolean;
  fillHoles: boolean;
  gapFill: number; // px theo ảnh GỐC
}

export interface FrameMaskResult {
  naturalWidth: number;
  naturalHeight: number;
  detectedBy: "alpha" | "luminance"; // cách thật sự đã dùng (auto quy về 1 trong 2)
  coverage: number; // tỉ lệ diện tích vùng LED, 0-1 — 0 hoặc ~1 = nhận diện sai, panel cảnh báo
  outlineUrl: string;
  outsideUrl: string;
}

// Cạnh dài tối đa của ảnh làm việc — pixel map thật có thể 4K+, xử lý ở độ phân giải này là đủ mịn cho
// canvas 1920×1080 mà vẫn nhanh (vài chục ms/lượt lọc).
const MAX_WORK_SIZE = 2048;
// Ngưỡng: alpha >= 128 = đục; độ sáng >= 40/255 = sáng (nền đen tuyệt đối/gần đen = ngoài LED).
const ALPHA_THRESHOLD = 128;
const LUMINANCE_THRESHOLD = 40;
// Auto: > 0.5% pixel có độ trong suốt → ảnh dùng nền trong suốt để đánh dấu vùng ngoài LED.
const AUTO_ALPHA_RATIO = 0.005;
// Dày viền, tính theo px trên canvas 1920 (quy đổi sang ảnh làm việc).
const OUTLINE_CANVAS_PX = 3;
const OUTLINE_COLOR = [0xff, 0xca, 0x2d]; // #FFCA2D = màu `highlight`, cùng màu nét khung chữ nhật

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Cannot read this image"));
    img.src = src;
  });
}

// Co/giãn hình thái học ô vuông bán kính r trên mặt nạ nhị phân (1 = LED), tách 2 lượt ngang/dọc bằng
// tổng tiền tố — O(số pixel) bất kể r. `oob` = giá trị coi cho phần NGOÀI mép ảnh.
function morph(src: Uint8Array, w: number, h: number, r: number, mode: "dilate" | "erode", oob: 0 | 1): Uint8Array {
  if (r <= 0) return src;
  const win = 2 * r + 1;
  const pass = (input: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(w * h);
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const prefix = new Int32Array(len + 1);
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < len; i++) {
        const idx = horizontal ? line * w + i : i * w + line;
        prefix[i + 1] = prefix[i] + input[idx];
      }
      for (let i = 0; i < len; i++) {
        const lo = Math.max(0, i - r);
        const hi = Math.min(len, i + r + 1);
        const count = prefix[hi] - prefix[lo] + (win - (hi - lo)) * oob;
        const on = mode === "dilate" ? count > 0 : count === win;
        out[horizontal ? line * w + i : i * w + line] = on ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

// Vùng "ngoài LED" không thông ra mép ảnh = lỗ kín bên trong (chữ số tấm LED, khe kín) → lấp thành LED.
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const reached = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!mask[i] && !reached[i]) {
      reached[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !reached[i] ? 1 : 0;
  return out;
}

function toDataUrl(w: number, h: number, paint: (data: Uint8ClampedArray) => void): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(w, h);
  paint(image.data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function computeFrameMask(src: string, options: FrameMaskOptions): Promise<FrameMaskResult> {
  const img = await loadImage(src);
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const workScale = Math.min(1, MAX_WORK_SIZE / Math.max(naturalWidth, naturalHeight));
  const w = Math.max(1, Math.round(naturalWidth * workScale));
  const h = Math.max(1, Math.round(naturalHeight * workScale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;

  let detectedBy: "alpha" | "luminance" = options.detect === "auto" ? "luminance" : options.detect;
  if (options.detect === "auto") {
    let translucent = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) translucent++;
    if (translucent / total > AUTO_ALPHA_RATIO) detectedBy = "alpha";
  }

  let mask: Uint8Array = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const a = px[i * 4 + 3];
    let on = a >= ALPHA_THRESHOLD;
    if (on && detectedBy === "luminance") {
      const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      on = lum >= LUMINANCE_THRESHOLD;
    }
    mask[i] = (on ? 1 : 0) ^ (options.invert ? 1 : 0);
  }

  // Lấp khe mảnh giữa các tấm LED (đóng = giãn rồi co). Co coi mép ảnh là LED để vùng LED chạm mép
  // ảnh không bị ăn vào.
  const gap = Math.round(options.gapFill * workScale);
  if (gap > 0) mask = morph(morph(mask, w, h, gap, "dilate", 0), w, h, gap, "erode", 1);
  if (options.fillHoles) mask = fillHoles(mask, w, h);

  // Viền = phần LED sẽ mất đi khi co mặt nạ `t` px (mép ảnh coi là NGOÀI — LED chạm mép ảnh thì mép
  // khung cũng có viền, đúng là chỗ bị cắt).
  const t = Math.max(1, Math.round((OUTLINE_CANVAS_PX * w) / 1920));
  const core = morph(mask, w, h, t, "erode", 0);

  let inside = 0;
  for (let i = 0; i < total; i++) inside += mask[i];

  const outlineUrl = toDataUrl(w, h, (d) => {
    for (let i = 0; i < total; i++) {
      if (mask[i] && !core[i]) {
        d[i * 4] = OUTLINE_COLOR[0];
        d[i * 4 + 1] = OUTLINE_COLOR[1];
        d[i * 4 + 2] = OUTLINE_COLOR[2];
        d[i * 4 + 3] = 255;
      }
    }
  });
  const outsideUrl = toDataUrl(w, h, (d) => {
    for (let i = 0; i < total; i++) if (!mask[i]) d[i * 4 + 3] = 255; // đen đặc (RGB mặc định 0)
  });

  return { naturalWidth, naturalHeight, detectedBy, coverage: inside / total, outlineUrl, outsideUrl };
}

// Cache dùng chung cả cửa sổ (Builder: canvas + Properties Panel cùng gọi). Giới hạn vài mục — mỗi mục
// giữ 2 PNG data URL, không để phình khi người dùng bấm đổi tuỳ chọn liên tục.
const CACHE_LIMIT = 6;
const cache = new Map<string, Promise<FrameMaskResult>>();

function cacheKey(src: string, o: FrameMaskOptions) {
  return `${o.detect}|${o.invert ? 1 : 0}|${o.fillHoles ? 1 : 0}|${o.gapFill}|${src}`;
}

export function getFrameMask(src: string, options: FrameMaskOptions): Promise<FrameMaskResult> {
  const key = cacheKey(src, options);
  let entry = cache.get(key);
  if (!entry) {
    entry = computeFrameMask(src, options);
    cache.set(key, entry);
    entry.catch(() => cache.delete(key));
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return entry;
}

/** null khi chưa có ảnh/đang xử lý; `error` khi ảnh hỏng. Kết quả cũ giữ nguyên trong lúc tính lại
 *  (đổi tuỳ chọn) để lớp phủ không nháy mất. */
export function useFrameMask(src: string | null | undefined, options: FrameMaskOptions) {
  const [state, setState] = useState<{ result: FrameMaskResult | null; error: string | null; busy: boolean }>({
    result: null,
    error: null,
    busy: false,
  });
  const { detect, invert, fillHoles: fill, gapFill } = options;
  useEffect(() => {
    if (!src) {
      setState({ result: null, error: null, busy: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, busy: true }));
    getFrameMask(src, { detect, invert, fillHoles: fill, gapFill })
      .then((result) => !cancelled && setState({ result, error: null, busy: false }))
      .catch((e: Error) => !cancelled && setState({ result: null, error: e.message, busy: false }));
    return () => {
      cancelled = true;
    };
  }, [src, detect, invert, fill, gapFill]);
  return state;
}
