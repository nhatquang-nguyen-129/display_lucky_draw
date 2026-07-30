import { useEffect, useRef } from "react";
import { DrawSequenceActions, TriggerAction } from "@/lib/landing/types";

// Dispatch MỆNH LỆNH (không phải state liên tục) cho 1 component — thay thế hẳn mô hình cũ của
// useActiveReactions.ts (tính lại "đang active hay không" mỗi render). Mỗi TriggerAction chỉ bắn
// đúng 1 lần tín hiệu `command` (1 chuỗi bất kỳ trong COMPONENT_SIGNALS.listensFor của loại component
// đang gọi hook này — xem componentRegistry.ts) khi ĐÚNG component nguồn của nó (action.sourceComponentId)
// phát tín hiệu (tra theo triggerLog[sourceComponentId].firedAt, xem TriggerLog ở types.ts), sau khi
// đợi đủ delayMs. Component nhận lệnh tự quản lý state idle/playing của chính nó (xem
// FireworksView.tsx/StageLightView.tsx/WheelTemplate.tsx) — hook này không biết và không cần biết
// tín hiệu đó LÀM GÌ.
export function useTriggerCommands(
  triggerActions: TriggerAction[] | undefined,
  sequence: DrawSequenceActions | undefined,
  onCommand: (command: string) => void
): void {
  // Key = triggerAction.id, value = firedAt cuối cùng ĐÃ dispatch — chặn dispatch lặp lại khi
  // component re-render vì lý do khác (vd 1 Button khác được bấm, làm đổi object triggerLog).
  const dispatchedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!sequence || !triggerActions || triggerActions.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    triggerActions.forEach((action) => {
      const last = sequence.triggerLog[action.sourceComponentId];
      if (!last) return;
      if (dispatchedRef.current.get(action.id) === last.firedAt) return;

      const fire = () => {
        dispatchedRef.current.set(action.id, last.firedAt);
        onCommand(action.command);
      };
      const elapsed = Date.now() - last.firedAt;
      const remaining = action.delayMs - elapsed;
      if (remaining <= 0) fire();
      else timers.push(setTimeout(fire, remaining));
    });

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence?.triggerLog, triggerActions]);
}
