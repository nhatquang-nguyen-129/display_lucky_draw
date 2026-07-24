import { useEffect, useState } from "react";
import { EffectReaction, LastTrigger } from "@/lib/landing/types";

export interface ReactionTarget {
  id: string; // component.id, hoặc "__background__" cho canvas background
  reactions: EffectReaction[];
}

// Với 1 `lastTrigger` (trigger thật gần nhất do useDrawSequence bắn ra) + danh sách target (mỗi
// component/background cùng list reactions của nó), tính xem target nào ĐANG có reaction active
// tại thời điểm hiện tại — dựa vào delayMs/durationMs của từng reaction so với lastTrigger.firedAt.
// Không poll liên tục — chỉ tự re-render đúng vào các mốc 1 reaction bắt đầu/kết thúc, qua setTimeout.
export function useActiveReactions(
  targets: ReactionTarget[],
  lastTrigger: LastTrigger | null
): Map<string, EffectReaction> {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!lastTrigger) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    targets.forEach((t) => {
      t.reactions.forEach((r) => {
        if (r.trigger !== lastTrigger.event) return;
        timers.push(setTimeout(() => bump((n) => n + 1), r.delayMs));
        if (r.durationMs > 0) timers.push(setTimeout(() => bump((n) => n + 1), r.delayMs + r.durationMs));
      });
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTrigger]);

  const active = new Map<string, EffectReaction>();
  if (!lastTrigger) return active;
  const elapsed = Date.now() - lastTrigger.firedAt;
  targets.forEach((t) => {
    const reaction = t.reactions.find((r) => {
      if (r.trigger !== lastTrigger.event) return false;
      if (elapsed < r.delayMs) return false;
      if (r.durationMs > 0 && elapsed > r.delayMs + r.durationMs) return false;
      return true;
    });
    if (reaction) active.set(t.id, reaction);
  });
  return active;
}
