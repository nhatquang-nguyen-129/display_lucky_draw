// Hit-test THEO ĐÚNG PIXEL alpha thật của ảnh PNG trong suốt (Prize Image/Prize Gallery), thay vì
// theo HÌNH CHỮ NHẬT bounding box của element — bounding box từng gây bug: hover/click ở vùng TRONG
// SUỐT của ảnh (nằm trong box nhưng ngoài silhouette thật) vẫn tính là "trong ảnh", và khi nhiều
// instance rải khắp landing CHỒNG bounding box lên nhau (đúng use-case chính của Prize Image — pin
// theo artwork nền), box của ảnh TRÊN che mất hover/click của ảnh DƯỚI dù đang trỏ đúng vào pixel thật
// của ảnh dưới. `display_image` LUÔN là base64 data URL (xem Prize.display_image trong types.ts) nên
// đọc pixel qua canvas không bao giờ bị taint bởi CORS.
//
// Cache theo `src` (data URL) — decode 1 LẦN, dùng lại cho mọi lần hover/click sau đó cho tới khi ảnh
// đổi. Không có cơ chế evict (số lượng giải trong 1 session luôn nhỏ, chấp nhận được).
type AlphaEntry = { width: number; height: number; data: Uint8ClampedArray };
const alphaCache = new Map<string, AlphaEntry | "error">();
const pendingLoads = new Set<string>();

export function ensureAlphaLoaded(src: string | null | undefined): void {
  if (!src || alphaCache.has(src) || pendingLoads.has(src)) return;
  pendingLoads.add(src);
  const img = new Image();
  img.onload = () => {
    pendingLoads.delete(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      alphaCache.set(src, "error");
      return;
    }
    ctx.drawImage(img, 0, 0);
    try {
      alphaCache.set(src, { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
    } catch {
      alphaCache.set(src, "error");
    }
  };
  img.onerror = () => {
    pendingLoads.delete(src);
    alphaCache.set(src, "error");
  };
  img.src = src;
}

// Alpha dưới ngưỡng này coi như "trong suốt" (không tính là trong ảnh) — nhỏ, chỉ để bỏ qua vùng
// hoàn toàn rỗng, KHÔNG loại viền anti-alias mờ (viền mờ vẫn nên tính là "trong ảnh" để hover/click
// không bị "hụt" ngay sát rìa silhouette thật).
const ALPHA_THRESHOLD = 10;

type FitMode = "cover" | "contain" | "stretch";

// Toạ độ BOX (0..1 mỗi trục, trong khung ĐÃ áp dụng object-fit) -> toạ độ ẢNH GỐC (0..1 theo pixel
// thật, natural width/height) — dùng CHUNG bởi isPointOnOpaquePixel (đổi từ điểm chuột, quy về box
// trước) và nearestOpaqueBoxFraction bên dưới (đã có sẵn toạ độ box). Chỉ CẦN tỉ lệ boxWidth/boxHeight
// đúng — không cần đúng pixel màn hình thật (mọi công thức bên dưới đều theo TỈ LỆ, nhân cả 2 chiều
// với 1 hằng số không đổi kết quả), nên gọi được bằng cả rect thật (getBoundingClientRect) lẫn kích
// thước LOGIC của component (LandingComponent.width/height).
function boxFractionToImageFraction(
  boxFracX: number,
  boxFracY: number,
  boxWidth: number,
  boxHeight: number,
  entry: AlphaEntry,
  fit: FitMode
): { x: number; y: number } {
  if (fit === "stretch") return { x: boxFracX, y: boxFracY };
  const scale =
    fit === "cover"
      ? Math.max(boxWidth / entry.width, boxHeight / entry.height)
      : Math.min(boxWidth / entry.width, boxHeight / entry.height);
  const displayedW = entry.width * scale;
  const displayedH = entry.height * scale;
  const offsetX = (boxWidth - displayedW) / 2;
  const offsetY = (boxHeight - displayedH) / 2;
  return { x: (boxFracX * boxWidth - offsetX) / displayedW, y: (boxFracY * boxHeight - offsetY) / displayedH };
}

// NGƯỢC lại — toạ độ ẢNH GỐC (0..1) -> toạ độ BOX (0..1), dùng để đổi 1 pixel ảnh tìm được (xem
// findNearestOpaquePixel) trở lại thành % CSS transform-origin.
function imageFractionToBoxFraction(
  imgFracX: number,
  imgFracY: number,
  boxWidth: number,
  boxHeight: number,
  entry: AlphaEntry,
  fit: FitMode
): { x: number; y: number } {
  if (fit === "stretch") return { x: imgFracX, y: imgFracY };
  const scale =
    fit === "cover"
      ? Math.max(boxWidth / entry.width, boxHeight / entry.height)
      : Math.min(boxWidth / entry.width, boxHeight / entry.height);
  const displayedW = entry.width * scale;
  const displayedH = entry.height * scale;
  const offsetX = (boxWidth - displayedW) / 2;
  const offsetY = (boxHeight - displayedH) / 2;
  return { x: (imgFracX * displayedW + offsetX) / boxWidth, y: (imgFracY * displayedH + offsetY) / boxHeight };
}

// `rect` PHẢI là bounding box của ĐÚNG element đang áp dụng object-fit (vd chính thẻ <img>) — object-fit
// tính tỉ lệ hiển thị/khoảng đệm (letterbox) dựa trên kích thước NGUYÊN của ảnh so với box này.
// Chưa tải xong alpha (cache miss) hoặc lỗi decode → fallback trả `true` (coi như trong ảnh) để KHÔNG
// vô hiệu hoá tương tác chỉ vì lỗi kỹ thuật/đang tải — thà "quá rộng rãi" 1 nhịp còn hơn im lặng mất
// tương tác.
export function isPointOnOpaquePixel(
  src: string | null | undefined,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  fit: FitMode
): boolean {
  if (!src) return true;
  const entry = alphaCache.get(src);
  if (!entry || entry === "error" || rect.width <= 0 || rect.height <= 0) return true;

  const { x: fracX, y: fracY } = boxFractionToImageFraction(
    (clientX - rect.left) / rect.width,
    (clientY - rect.top) / rect.height,
    rect.width,
    rect.height,
    entry,
    fit
  );

  if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return false;
  const px = Math.min(entry.width - 1, Math.max(0, Math.floor(fracX * entry.width)));
  const py = Math.min(entry.height - 1, Math.max(0, Math.floor(fracY * entry.height)));
  return entry.data[(py * entry.width + px) * 4 + 3] > ALPHA_THRESHOLD;
}

function isOpaqueAt(entry: AlphaEntry, px: number, py: number): boolean {
  if (px < 0 || px >= entry.width || py < 0 || py >= entry.height) return false;
  return entry.data[(py * entry.width + px) * 4 + 3] > ALPHA_THRESHOLD;
}

// Bán kính tìm kiếm tối đa, tính theo TỈ LỆ min(width,height) của ẢNH THẬT — chặn trên để tránh quét
// vô hạn nếu khu vực đó không có điểm ảnh hiển thị nào gần (hiếm — PNG rỗng hoàn toàn ở góc đó). Quét
// theo VÒNG (ring) mở rộng dần nên rẻ, không phải duyệt cả ảnh.
const MAX_SEARCH_RADIUS_FRACTION = 0.6;

// Tìm pixel CÓ THẬT (alpha > ngưỡng) gần (startX, startY) nhất — quét theo vòng vuông Chebyshev mở
// rộng dần (đủ chính xác cho mục đích "điểm neo trực quan", không cần Euclidean tuyệt đối), trả về
// CHÍNH điểm bắt đầu nếu nó đã là pixel thật rồi, hoặc `null` nếu không tìm thấy gì trong bán kính
// cho phép.
function findNearestOpaquePixel(entry: AlphaEntry, startX: number, startY: number): { x: number; y: number } | null {
  if (isOpaqueAt(entry, startX, startY)) return { x: startX, y: startY };
  const maxRadius = Math.ceil(Math.min(entry.width, entry.height) * MAX_SEARCH_RADIUS_FRACTION);
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      if (isOpaqueAt(entry, startX + dx, startY - r)) return { x: startX + dx, y: startY - r };
      if (isOpaqueAt(entry, startX + dx, startY + r)) return { x: startX + dx, y: startY + r };
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      if (isOpaqueAt(entry, startX - r, startY + dy)) return { x: startX - r, y: startY + dy };
      if (isOpaqueAt(entry, startX + r, startY + dy)) return { x: startX + r, y: startY + dy };
    }
  }
  return null;
}

// Cache kết quả theo (src, toạ độ box đã làm tròn, kích thước box, fit) — tránh quét lại mỗi lần
// render (component có thể re-render nhiều lần dù direction/size không đổi). Không evict — cùng lý do
// đã chấp nhận cho `alphaCache` ở trên (số lượng giải trong 1 session luôn nhỏ).
const nearestOpaqueCache = new Map<string, { x: number; y: number }>();

// Trả về toạ độ BOX (0..1 mỗi trục) đã "kéo" về điểm ảnh THẬT gần nhất — dùng làm neo cố định
// (transform-origin) cho hiệu ứng Scale Up, xem doc-comment computePrizeTransform trong
// prizeEffectTransform.ts. Bug đã gặp: điểm neo tính THUẦN hình học (theo % khung chữ nhật, không biết
// gì về alpha) có thể rơi vào đúng vùng TRONG SUỐT của PNG — ảnh trông như "trồi lên" từ 1 điểm vô
// hình thay vì neo đúng vào chủ thể. Nếu điểm gốc ĐÃ nằm trên pixel thật, hoặc chưa tải xong alpha/
// lỗi/không có ảnh, trả về CHÍNH toạ độ đầu vào KHÔNG đổi (an toàn, không có gì để "kéo" về).
export function nearestOpaqueBoxFraction(
  src: string | null | undefined,
  boxFracX: number,
  boxFracY: number,
  boxWidth: number,
  boxHeight: number,
  fit: FitMode
): { x: number; y: number } {
  if (!src || boxWidth <= 0 || boxHeight <= 0) return { x: boxFracX, y: boxFracY };
  const entry = alphaCache.get(src);
  if (!entry || entry === "error") return { x: boxFracX, y: boxFracY };

  const cacheKey = `${src}|${boxFracX.toFixed(3)}|${boxFracY.toFixed(3)}|${boxWidth}|${boxHeight}|${fit}`;
  const cached = nearestOpaqueCache.get(cacheKey);
  if (cached) return cached;

  const imgFrac = boxFractionToImageFraction(boxFracX, boxFracY, boxWidth, boxHeight, entry, fit);
  const startX = Math.min(entry.width - 1, Math.max(0, Math.round(imgFrac.x * entry.width)));
  const startY = Math.min(entry.height - 1, Math.max(0, Math.round(imgFrac.y * entry.height)));

  const found = findNearestOpaquePixel(entry, startX, startY);
  const result = found
    ? imageFractionToBoxFraction((found.x + 0.5) / entry.width, (found.y + 0.5) / entry.height, boxWidth, boxHeight, entry, fit)
    : { x: boxFracX, y: boxFracY };

  nearestOpaqueCache.set(cacheKey, result);
  return result;
}
