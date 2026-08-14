import { useEffect } from "react";

// Gắn 1 listener "keydown" ở window trong SUỐT thời gian component này còn mounted, gọi `onEscape`
// khi bấm phím Esc — dùng làm con của 1 popup cần đóng/huỷ bằng Esc (Scoreboard, popup Confirm/Reset
// của Button — xem LandingRenderer.tsx), thay vì thêm state/effect trực tiếp vào LandingRenderer.tsx
// (giữ đúng "Painter thuần, không có state" — xem comment đầu file đó). Vòng đời gắn liền với mount/
// unmount của chính popup gọi nó nên không cần tự kiểm tra "popup có đang mở hay không" ở đây — component
// cha chỉ render cái này khi popup đang mở. Không có UI riêng.
export default function EscapeKeyHandler({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape]);
  return null;
}
