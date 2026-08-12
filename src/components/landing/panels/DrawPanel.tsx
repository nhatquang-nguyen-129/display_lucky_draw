// Receiver thuần — cùng nguyên tắc với LinkOpenerPanel.tsx: chỉ cấu hình bản thân component,
// không có phần trigger ở đây (wiring nằm ở Trigger Graph). Không có gì để cấu hình — pick() chỉ
// cần sessionId, Draw Engine tự quyết định giải/người tiếp theo (xem componentRegistry.ts). Hướng
// dẫn chi tiết đã dời sang trang Help (src/pages/Help.tsx) — panel này không còn field nào để hiện.
export default function DrawPanel() {
  return null;
}
