import { isPointOnOpaquePixel } from "./pixelAlphaHitTest";

// Xử lý đúng use-case CHÍNH của Prize Image: NHIỀU instance rải khắp landing, bounding box CHỒNG lên
// nhau (đặt ghim theo artwork nền, xem doc-comment đầu PrizeImageView.tsx) — pixelAlphaHitTest.ts chỉ
// tự tính đúng alpha CỦA RIÊNG 1 element, không biết gì về element KHÁC che/nằm dưới nó. Bug thật đã
// gặp: ảnh A (transparent tại điểm đang trỏ) nằm ĐÈ LÊN ảnh B — theo hit-test bình thường của DOM,
// browser chỉ gửi sự kiện chuột cho ĐÚNG 1 phần tử trên cùng (ảnh A), nên dù pixelAlphaHitTest.ts đã
// đúng "ảnh A trong suốt ở đây" thì ảnh B bên dưới VẪN không nhận được sự kiện — chuột coi như "lọt
// qua" hoàn toàn khỏi cả 2 ảnh, không ai phản ứng, thay vì ảnh B phải là người nhận đúng.
//
// Giải pháp: 1 CẶP listener DUY NHẤT gắn ở `document` (không phải trên từng element riêng), mỗi lần
// chuột di chuyển/click tự dò LẠI TOÀN BỘ ngăn xếp phần tử tại đúng điểm đó bằng
// `document.elementsFromPoint` (trả về ĐÚNG thứ tự z thật, tính cả các loại component khác như Button
// — xem comment "pointerEvents: none" mặc định trong LandingRenderer.tsx: MỌI khung kéo-thả component
// mặc định pointer-events:none, chỉ nội dung thật của Button/Prize Image/Prize Gallery tự bật lại
// "auto" nên đây là 3 loại DUY NHẤT thật sự xuất hiện trong ngăn xếp này) rồi lần lượt kiểm tra TỪNG
// prize đã đăng ký theo đúng thứ tự trên xuống: ảnh nào trong suốt tại điểm đó thì BỎ QUA (coi như
// "xuyên qua"), ảnh ĐẦU TIÊN có pixel THẬT SỰ (alpha > ngưỡng) tại đúng điểm mới là người thắng. Gặp
// 1 phần tử KHÔNG PHẢI prize đã đăng ký (vd Button, hoặc html/body ở đáy ngăn xếp) thì DỪNG ngay —
// coi như bị 1 thứ khác che thật, không cố xuyên qua nó.
export interface PrizeHitTarget {
  getSrc: () => string | null;
  getFit: () => "cover" | "contain" | "stretch";
  getImgRect: () => { left: number; top: number; width: number; height: number } | null;
  setHover: (hovering: boolean) => void;
  onOpaqueClick: (e: MouseEvent) => void;
}

const HIT_ATTR = "data-prize-hit-target";
const targets = new Map<Element, PrizeHitTarget>();
let hoveredEl: Element | null = null;
let listenersAttached = false;

function findOpaqueTargetAt(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y);
  const tested = new Set<Element>();
  for (const el of stack) {
    const rootEl = el.closest(`[${HIT_ATTR}]`);
    // Phần tử này KHÔNG thuộc bất kỳ prize nào đã đăng ký (Button, hoặc chạm đáy html/body) — chặn
    // hẳn tại đây, không xuyên tiếp xuống dưới (nó đang thật sự che khuất phần còn lại).
    if (!rootEl) return null;
    if (tested.has(rootEl)) continue; // đã kiểm tra target này rồi (nhiều lớp con cùng thuộc 1 target)
    tested.add(rootEl);
    const target = targets.get(rootEl);
    if (!target) continue;
    const rect = target.getImgRect();
    if (rect && isPointOnOpaquePixel(target.getSrc(), x, y, rect, target.getFit())) return rootEl;
  }
  return null;
}

function ensureListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.addEventListener("mousemove", (e) => {
    if (targets.size === 0) return;
    const winner = findOpaqueTargetAt(e.clientX, e.clientY);
    if (winner === hoveredEl) return;
    if (hoveredEl) targets.get(hoveredEl)?.setHover(false);
    if (winner) targets.get(winner)?.setHover(true);
    hoveredEl = winner;
  });

  // Chuột rời khỏi TOÀN BỘ cửa sổ (vd rê ra ngoài viền app) — mousemove không tự bắn thêm sự kiện nào
  // nữa nên phải tự dọn hover đang treo, tránh hiệu ứng bị "kẹt" mãi ở trạng thái hover cuối cùng.
  document.addEventListener("mouseleave", () => {
    if (hoveredEl) targets.get(hoveredEl)?.setHover(false);
    hoveredEl = null;
  });

  document.addEventListener("click", (e) => {
    if (targets.size === 0) return;
    const winner = findOpaqueTargetAt(e.clientX, e.clientY);
    if (winner) targets.get(winner)?.onOpaqueClick(e);
  });
}

// Đăng ký 1 prize (Prize Image) — `el` PHẢI là ĐÚNG phần tử DOM thật sự bật `pointer-events: auto`
// (root div của PrizeImageView.tsx) — component gọi hàm này trong `useEffect`, dùng con trỏ trả về để
// huỷ đăng ký lúc unmount hoặc lúc `interactive` tắt đi (Builder canvas không đăng ký gì, giữ nguyên
// hành vi pointer-events:none cũ ở đó).
export function registerPrizeHitTarget(el: HTMLElement, target: PrizeHitTarget): () => void {
  ensureListeners();
  el.setAttribute(HIT_ATTR, "");
  targets.set(el, target);
  return () => {
    targets.delete(el);
    el.removeAttribute(HIT_ATTR);
    if (hoveredEl === el) {
      target.setHover(false);
      hoveredEl = null;
    }
  };
}
