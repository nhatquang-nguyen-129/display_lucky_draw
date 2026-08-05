// Receiver thuần — cùng nguyên tắc với LinkOpenerPanel.tsx: chỉ cấu hình bản thân component,
// không có phần trigger ở đây (wiring nằm ở Trigger Graph). Không có gì để cấu hình — pick() chỉ
// cần sessionId, Draw Engine tự quyết định giải/người tiếp theo (xem componentRegistry.ts).
export default function DrawPanel() {
  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-base-500">
        Picks a pending winner for the current draw when triggered. Does nothing if there are no
        eligible participants or prizes left. Wire a link in the Trigger Graph (e.g. Button →
        "Draw.Pick" → this component) to trigger it — and wire this component's own
        "Draw.Picked" signal onward (e.g. to a Lucky Wheel's "Wheel.StartSpin") to react exactly
        when the pick actually lands, not a guessed delay.
      </p>
    </div>
  );
}
