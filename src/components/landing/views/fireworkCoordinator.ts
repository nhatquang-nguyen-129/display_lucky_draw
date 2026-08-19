import { FireworkEffect } from "@/lib/landing/types";

// Cầu nối 1 CHIỀU giữa PrizeImageView.tsx (nơi phát hiện `justWon` cho 1 seed mới, xem doc-comment
// onWonFirework trong types.ts) và FireworkOverlay.tsx (canvas toàn màn hình, mount ở PresentMode.tsx
// NGOÀI canvas đã scale) — 2 bên không có quan hệ cha-con, xa nhau trong cây render nên không dùng
// props/Context được, cùng kiểu module-singleton pub-sub đã dùng cho prizeHitCoordinator.ts (khác ở
// chỗ đây chỉ là 1 sự kiện "bắn" đơn giản, không cần Map theo dõi nhiều target).
export interface FireworkLaunch {
  color1: string;
  color2: string;
  burstCount: number;
  durationMs: number;
}

type Listener = (launch: FireworkLaunch) => void;
const listeners = new Set<Listener>();

export function launchFirework(effect: FireworkEffect) {
  const launch: FireworkLaunch = {
    color1: effect.color1,
    color2: effect.color2,
    burstCount: effect.burstCount,
    durationMs: effect.durationMs,
  };
  listeners.forEach((l) => l(launch));
}

// FireworkOverlay.tsx gọi 1 LẦN lúc mount — nếu chưa mount kịp (vd landing vừa mở, ăn mừng bắn ngay)
// thì lượt bắn đó bị bỏ qua, chấp nhận được vì đây là hiệu ứng trang trí, không phải dữ liệu.
export function subscribeFirework(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
