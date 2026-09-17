import { useEffect, useRef, useState } from "react";
import { BackgroundConfig, isLiveDrawResultId, LandingData } from "@/lib/landing/types";

// Lớp phủ đen mờ dần lên TRÊN background, DƯỚI mọi component khác (render làm con ĐẦU TIÊN trong
// LandingRenderer.tsx, trước {sorted.map(...)}) — "spotlight" cho nội dung nổi bật hơn (Winner Name,
// Button...) sau khi Lucky Wheel trên trang đã quay xong hẳn. 2 CHIỀU tách biệt hoàn toàn, mỗi chiều
// tự có delay + thời gian chuyển riêng (xem BackgroundConfig trong types.ts):
//   - "start" (dim XUỐNG) — hẹn giờ ở `winnerRevealDelayMs + dimStartDelayMs` (mốc "Wheel quay xong"
//     tự tính riêng cho overlay này, xem computeWheelRevealDelayMs — WinnerNameView không còn dùng
//     chung mốc này nữa, tự quản lý Delay riêng qua appearDelayMs/disappearDelayMs) sau khi candidate
//     hiện tại xuất hiện, rồi chuyển opacity qua CSS transition dài `dimStartDurationMs`.
//   - "end" (sáng LẠI) — hẹn giờ ở `dimEndDelayMs` sau khi có candidate MỚI (Draw/Discard lần tiếp),
//     chuyển opacity qua CSS transition dài `dimEndDurationMs`.
// `transitionDuration` phải đặt qua INLINE style (không phải class Tailwind cố định) vì 2 chiều có
// thời gian chuyển KHÁC NHAU — set đúng giá trị cho chiều SẮP chạy trước khi đổi opacity kích hoạt nó.
export default function BackgroundDimOverlay({
  background,
  data,
  winnerRevealDelayMs,
}: {
  background: BackgroundConfig;
  data?: LandingData;
  winnerRevealDelayMs: number;
}) {
  const enabled = !!background.dimOnSpinEnd;
  const dimAmount = background.dimAmount ?? 50;
  const startDelayMs = background.dimStartDelayMs ?? 0;
  const startDurationMs = background.dimStartDurationMs ?? 1000;
  const endDelayMs = Math.max(0, background.dimEndDelayMs ?? 0);
  const endDurationMs = background.dimEndDurationMs ?? 1000;
  // Chỉ dim theo dòng kết quả LIVE (id "pending-*" — 1 lượt Draw đang diễn ra trong phiên Present
  // này), bỏ qua kết quả cũ đọc từ DB khi mở lại 1 phiên đã quay dở (nếu không nền tự dim xuống sau
  // winnerRevealDelayMs dù chưa ai bấm Draw).
  const latestId = isLiveDrawResultId(data?.results[0]?.id) ? data!.results[0]!.id : undefined;

  const [dimmed, setDimmed] = useState(false);
  // Thời gian transition cho LẦN đổi opacity SẮP TỚI — đổi giá trị này TRƯỚC khi gọi setDimmed() ở
  // đúng nhánh tương ứng (start hay end), nên luôn khớp đúng chiều đang thực sự chạy.
  const [transitionMs, setTransitionMs] = useState(startDurationMs);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    if (brightenTimerRef.current) clearTimeout(brightenTimerRef.current);

    if (!enabled || latestId === undefined) {
      setDimmed(false);
      return;
    }

    // "end" — sáng lại, hẹn từ lúc CANDIDATE NÀY xuất hiện (bấm Draw/Discard lần tiếp so với lượt
    // trước) — vô hại nếu nền đang chưa dim gì (setDimmed(false) khi đã false không đổi gì trên màn).
    brightenTimerRef.current = setTimeout(() => {
      setTransitionMs(endDurationMs);
      setDimmed(false);
    }, endDelayMs);

    // "start" — dim xuống, hẹn từ lúc Wheel (dự kiến) quay xong hẳn.
    const dimAt = Math.max(0, winnerRevealDelayMs + startDelayMs);
    dimTimerRef.current = setTimeout(() => {
      setTransitionMs(startDurationMs);
      setDimmed(true);
    }, dimAt);

    return () => {
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
      if (brightenTimerRef.current) clearTimeout(brightenTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId, enabled, startDelayMs, startDurationMs, endDelayMs, endDurationMs, winnerRevealDelayMs]);

  if (!enabled) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 bg-black ease-out"
      style={{
        opacity: dimmed ? dimAmount / 100 : 0,
        transitionProperty: "opacity",
        transitionDuration: `${transitionMs}ms`,
      }}
    />
  );
}
