import { useEffect, useRef, useState } from "react";
import { DrawSequenceActions, StageLightComponent } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

// Chùm sáng vẽ bằng 1 hình tam giác CSS (clip-path), đỉnh ở gốc đèn (top-center của khung component),
// đáy rộng beamWidth ở khoảng cách beamLength — xoay quanh đỉnh (transformOrigin "50% 0%") để mô
// phỏng đèn quét. Giữ nguyên quy ước "ghi transform thẳng vào ref mỗi khung hình, không qua state
// React" đã dùng ở DigitRollerTemplate.tsx — animation góc quét mượt hơn nhiều so với setState/frame.
function BeamShape({
  beamColor,
  beamOpacity,
  beamWidth,
  beamLength,
  blurAmount,
  intensity,
  beamRef,
  initialAngle,
}: {
  beamColor: string;
  beamOpacity: number;
  beamWidth: number;
  beamLength: number;
  blurAmount: number;
  intensity: number;
  beamRef: React.RefObject<HTMLDivElement>;
  initialAngle?: number; // góc ban đầu (độ) — chỉ dùng cho khung tĩnh trong Builder, đèn đang quét
  // thật ghi transform thẳng vào beamRef mỗi khung hình (không đi qua prop này).
}) {
  return (
    <div
      ref={beamRef}
      className="absolute left-1/2 top-0"
      style={{
        width: beamWidth,
        height: beamLength,
        marginLeft: -beamWidth / 2,
        transformOrigin: "50% 0%",
        transform: initialAngle !== undefined ? `rotate(${initialAngle}deg)` : undefined,
        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
        background: `linear-gradient(to bottom, ${beamColor} 0%, transparent 100%)`,
        opacity: beamOpacity * intensity,
        filter: `blur(${blurAmount}px)`,
      }}
    />
  );
}

// Beam đang quét thật (Present Mode, đã nhận lệnh "StageLight.Play") — rAF ghi thẳng góc quay vào
// ref mỗi khung hình, tự dừng khi unmount (nhận "StageLight.Stop", hoặc hết `duration` khi loop=false).
function SweepingBeam({ component }: { component: StageLightComponent }) {
  const { beamColor, beamOpacity, beamWidth, beamLength, sweepAngle, swingRange, sweepSpeed, blurAmount, intensity } =
    component.props;
  const beamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const startTs = performance.now();
    function frame(ts: number) {
      const tSec = (ts - startTs) / 1000;
      const angle = sweepAngle + swingRange * Math.sin((tSec / Math.max(0.1, sweepSpeed)) * Math.PI * 2);
      if (beamRef.current) beamRef.current.style.transform = `rotate(${angle}deg)`;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sweepAngle, swingRange, sweepSpeed]);

  return (
    <BeamShape
      beamRef={beamRef}
      beamColor={beamColor}
      beamOpacity={beamOpacity}
      beamWidth={beamWidth}
      beamLength={beamLength}
      blurAmount={blurAmount}
      intensity={intensity}
    />
  );
}

interface StageLightViewProps {
  component: StageLightComponent;
  sequence?: DrawSequenceActions;
}

export default function StageLightView({ component, sequence }: StageLightViewProps) {
  const { beamColor, beamOpacity, beamWidth, beamLength, sweepAngle, blurAmount, intensity, loop, duration } =
    component.props;
  const [playing, setPlaying] = useState(false);
  const staticBeamRef = useRef<HTMLDivElement>(null);

  useTriggerCommands(component.triggerActions, sequence, (command) => {
    setPlaying(command === "StageLight.Play");
  });

  // loop=false: tự về idle sau `duration` ms kể từ lúc "StageLight.Play" — không cần chờ lệnh
  // "StageLight.Stop" riêng.
  useEffect(() => {
    if (!playing || loop) return;
    const id = setTimeout(() => setPlaying(false), Math.max(0, duration));
    return () => clearTimeout(id);
  }, [playing, loop, duration]);

  if (!sequence) {
    // Builder canvas — luôn hiện khung tĩnh, đứng yên ở đúng sweepAngle, để đặt vị trí/góc chiếu.
    return (
      <BeamShape
        beamRef={staticBeamRef}
        beamColor={beamColor}
        beamOpacity={beamOpacity}
        beamWidth={beamWidth}
        beamLength={beamLength}
        blurAmount={blurAmount}
        intensity={intensity}
        initialAngle={sweepAngle}
      />
    );
  }

  if (!playing) return null;

  return <SweepingBeam component={component} />;
}
