// Receiver thuần — cùng nguyên tắc với LinkOpenerPanel.tsx: chỉ cấu hình bản thân component,
// không có phần trigger ở đây (wiring nằm ở Trigger Graph). Không có gì để cấu hình — confirm()
// chỉ cần candidate đang chờ sẵn có (từ 1 component Draw), xem componentRegistry.ts.
export default function ConfirmWinnerPanel() {
  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-base-500">
        Commits the pending draw result to the database when triggered — this is a real, permanent
        write (not undone by Discard). Does nothing if there's no pending candidate yet (wire a
        Draw component first) or one is already confirmed. Wire a link in the Trigger Graph (e.g.
        Button → "ConfirmWinner.Confirm" → this component) to trigger it.
      </p>
    </div>
  );
}
