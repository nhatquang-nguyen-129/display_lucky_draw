import { useState } from "react";
import { DimBackgroundComponent, DrawSequenceActions } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

interface DimBackgroundViewProps {
  component: DimBackgroundComponent;
  sequence?: DrawSequenceActions;
}

// Receiver thuần, đơn giản hơn cả StageLightView.tsx — chỉ 1 lớp phủ màu, tối/sáng dần qua CSS
// `transition: opacity`, không cần requestAnimationFrame gì cả. LUÔN mount (kể cả lúc idle, opacity 0)
// thay vì return null như Fireworks/StageLight — phải giữ mount xuyên suốt để transition có cái để
// animate TỪ lúc Play/Stop đổi opacity; unmount rồi remount lại sẽ mất hẳn hiệu ứng fade, opacity chỉ
// "nhảy" thẳng tới giá trị mới.
export default function DimBackgroundView({ component, sequence }: DimBackgroundViewProps) {
  const { color, targetOpacity, fadeDurationMs } = component.props;
  const [playing, setPlaying] = useState(false);

  useTriggerCommands(component.triggerActions, sequence, (command) => {
    setPlaying(command === "DimBackground.Play");
  });

  // Builder canvas (không có sequence thật) — đứng yên ở targetOpacity để canh màu/vùng phủ, không
  // transition (đổi tức thời theo giá trị đang chỉnh trong panel, không phải 1 lượt Play/Stop thật).
  const opacity = !sequence ? targetOpacity : playing ? targetOpacity : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: color,
        opacity,
        transition: sequence ? `opacity ${fadeDurationMs}ms ease` : undefined,
      }}
    />
  );
}
