import { useEffect, useRef, useState } from "react";
import { getParticipantField, LandingData, LuckyWheelComponent } from "@/lib/landing/types";

// Tốc độ nhấp nháy số lúc "đang quay" — chạy từ nhanh (MIN_DELAY) tới chậm (MAX_DELAY) theo
// đúng đường cong spinEasing đã chọn, y hệt cách wheel dùng spinEasing cho transform CSS, chỉ
// khác là ở đây không có transition liên tục nên phải tự nội suy độ trễ giữa các lần đổi số.
const MIN_DELAY = 40;
const MAX_DELAY = 220;

function ease(p: number, easing: LuckyWheelComponent["props"]["spinEasing"]): number {
  if (easing === "linear") return p;
  if (easing === "easeOut") return 1 - Math.pow(1 - p, 3);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function randomDigit(): string {
  return String(Math.floor(Math.random() * 10));
}

// Template "digitRoller" — thay vì vòng tròn, hiện N ký tự số cuối của winnerDisplayField (thường
// dùng cho phone) dưới dạng ô số kiểu máy đánh số/slot-machine, nhấp nháy ngẫu nhiên rồi dừng đúng
// ở số thật. Không cần drawField/displayField/mask vì không có khái niệm "segment" — chỉ đọc thẳng
// từ participant trúng thật (LandingData.results), giống hệt nguyên tắc "không tự chọn người trúng"
// của WheelTemplate.
export default function DigitRollerTemplate({ component, data }: { component: LuckyWheelComponent; data?: LandingData }) {
  const { winnerDisplayField, digitCount, fontFamily, fontSize, spinDurationMs, spinEasing } = component.props;
  const count = Math.max(1, Math.floor(digitCount || 3));
  const participants = data?.participants ?? [];
  const results = data?.results ?? [];

  const [digits, setDigits] = useState<string[]>(() => Array(count).fill("-"));
  const [spinning, setSpinning] = useState(false);
  const initializedRef = useRef(false);
  const lastResultIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDigits((prev) => (prev.length === count ? prev : Array(count).fill("-")));
  }, [count]);

  useEffect(() => {
    const latest = results[0];
    const latestId = latest?.id ?? null;

    if (!initializedRef.current) {
      // Đồng bộ lần đầu — không quay, kể cả khi phiên đã có sẵn kết quả từ trước.
      initializedRef.current = true;
      lastResultIdRef.current = latestId;
      return;
    }
    if (!latest || latestId === lastResultIdRef.current) return;
    lastResultIdRef.current = latestId;

    const winner = participants.find((p) => p.id === latest.participant_id);
    if (!winner) return;

    const rawDigits = getParticipantField(winner, winnerDisplayField).replace(/\D/g, "");
    const targetDigits = rawDigits.slice(-count).padStart(count, "0").split("");

    setSpinning(true);
    const startTime = performance.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const progress = Math.min(1, (performance.now() - startTime) / spinDurationMs);
      if (progress >= 1) {
        setDigits(targetDigits);
        setSpinning(false);
        return;
      }
      setDigits(Array.from({ length: count }, randomDigit));
      timeoutId = setTimeout(tick, MIN_DELAY + (MAX_DELAY - MIN_DELAY) * ease(progress, spinEasing));
    }
    tick();

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, count]);

  const cellWidth = Math.max(28, fontSize * 1.1);
  const cellHeight = Math.max(40, fontSize * 1.6);

  return (
    <div className="flex h-full w-full items-center justify-center gap-2" style={{ fontFamily }}>
      {/* Thẻ số cố định trắng/đen (kiểu bảng lật/slot-machine) — không dùng fontColor dùng chung
          với các template khác, vì nền thẻ luôn trắng nên chữ phải luôn tối để không bị chìm. */}
      {digits.map((d, i) => (
        <div
          key={i}
          className={`flex items-center justify-center rounded-lg bg-white text-[#111827] shadow-lg transition-transform ${spinning ? "scale-[1.03]" : ""}`}
          style={{ width: cellWidth, height: cellHeight, fontSize, fontWeight: 800 }}
        >
          {d}
        </div>
      ))}
    </div>
  );
}
