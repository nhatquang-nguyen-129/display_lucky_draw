// Receiver thuần — cùng nguyên tắc với LinkOpenerPanel.tsx: chỉ cấu hình bản thân component,
// không có phần trigger ở đây (wiring nằm ở Trigger Graph). Không có gì để cấu hình — confirm()
// chỉ cần candidate đang chờ sẵn có (từ 1 component Draw), xem componentRegistry.ts. Hướng dẫn chi
// tiết đã dời sang trang Help (src/pages/Help.tsx) — panel này không còn field nào để hiện.
export default function ConfirmWinnerPanel() {
  return null;
}
