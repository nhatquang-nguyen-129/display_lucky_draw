import { useEffect, useRef, useState } from "react";
import { Participant } from "@/types";
import { DrawSequenceActions, getParticipantField, LandingData, LuckyWheelComponent } from "@/lib/landing/types";
import { displayValue } from "./displayValue";
import { useTriggerCommands } from "../useTriggerCommands";

const FULL_TURNS = 5;

const EASING_CSS: Record<LuckyWheelComponent["props"]["spinEasing"], string> = {
  linear: "linear",
  easeOut: "cubic-bezier(0.15, 0.85, 0.35, 1)",
  easeInOut: "ease-in-out",
};

// Template "wheel" — vòng tròn chia segment theo từng participant, quay và dừng đúng ở người
// trúng thật (đọc từ LandingData.results, không tự chọn người trúng). Đây là template gốc,
// tách riêng khỏi LuckyWheelView để dễ thêm template mới mà không đụng vào code template cũ.
export default function WheelTemplate({
  component,
  data,
  sequence,
}: {
  component: LuckyWheelComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { drawField, displayField, winnerDisplayField, maskSensitiveData, fontFamily, fontColor, fontSize, spinDurationMs, spinEasing } =
    component.props;
  const participants = data?.participants ?? [];
  const results = data?.results ?? [];

  // Khử trùng segment theo drawField — 2 participant cùng giá trị field này gộp thành 1 segment
  // trên vòng quay (vd drawField = "phone" thì 2 dòng trùng SĐT chỉ hiện 1 lần).
  const segments: Participant[] = [];
  const seenKeys = new Set<string>();
  participants.forEach((p) => {
    const key = getParticipantField(p, drawField);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    segments.push(p);
  });

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Participant | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bắt đầu quay tới ĐÚNG người trúng đang có ở results[0] — gọi khi nhận tín hiệu "Wheel.StartSpin"
  // qua Trigger Graph (xem useTriggerCommands bên dưới), KHÔNG còn tự dò results[0]?.id đổi hay
  // chưa như trước. Huỷ timer của lượt quay TRƯỚC (nếu còn đang đếm dở) trước khi bắt đầu lượt mới,
  // tránh 2 lượt chồng lên nhau nếu tín hiệu bắn liên tiếp nhanh.
  function startSpin() {
    const latest = results[0];
    if (!latest) return;
    const winnerIndex = segments.findIndex((p) => p.id === latest.participant_id);
    if (winnerIndex === -1 || segments.length === 0) return; // người trúng không có trong pool đang hiển thị

    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);

    const anglePerSegment = 360 / segments.length;
    const targetMod = (((360 - winnerIndex * anglePerSegment) % 360) + 360) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;

    setWinner(null);
    setSpinning(true);
    setRotation((r) => r + FULL_TURNS * 360 + delta);

    spinTimerRef.current = setTimeout(() => {
      setSpinning(false);
      setWinner(segments[winnerIndex]);
    }, spinDurationMs);
  }

  useEffect(() => () => {
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
  }, []);

  useTriggerCommands(component.triggerActions, sequence, (command) => {
    if (command === "Wheel.StartSpin") startSpin();
  });

  const size = Math.max(40, Math.min(component.width, component.height));
  const radius = size / 2 - Math.max(24, size * 0.14);
  const anglePerSegment = segments.length > 0 ? 360 / segments.length : 0;

  return (
    <div className="relative flex h-full w-full items-center justify-center" style={{ fontFamily }}>
      <div style={{ width: size, height: size }} className="relative">
        <div
          className="absolute inset-0 overflow-hidden rounded-full border-4 border-gold-500/60 bg-base-900"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${spinDurationMs}ms ${EASING_CSS[spinEasing]}` : undefined,
          }}
        >
          {segments.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-center text-xs text-base-500">
              No participants
            </div>
          ) : (
            segments.map((p, i) => (
              <div
                key={p.id}
                className="absolute left-1/2 top-1/2 origin-center whitespace-nowrap"
                style={{
                  transform: `rotate(${i * anglePerSegment}deg) translate(${radius}px) rotate(${-i * anglePerSegment}deg) translate(-50%, -50%)`,
                  color: fontColor,
                  fontSize,
                }}
              >
                {displayValue(p, displayField, maskSensitiveData)}
              </div>
            ))
          )}
        </div>
        {/* Con trỏ cố định — không xoay theo đĩa, đánh dấu vị trí "trúng". */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-2xl leading-none text-gold-500">▼</div>
      </div>

      {winner && !spinning && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-base-950/80 px-4 py-1.5 text-center"
          style={{ color: fontColor, fontSize: Math.round(fontSize * 0.8) }}
        >
          🎉 {displayValue(winner, winnerDisplayField, maskSensitiveData)}
        </div>
      )}
    </div>
  );
}
