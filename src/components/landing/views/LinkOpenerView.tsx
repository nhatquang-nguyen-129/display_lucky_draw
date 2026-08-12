import { getParticipantField, LandingData, LinkOpenerComponent, DrawSequenceActions } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M10 14 20 4M20 4h-5M20 4v5" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

// Receiver thuần — tái tạo Button action "openLink" cũ (xem comment ở LinkOpenerComponent trong
// types.ts). Không có gì để hiện ở Present Mode (mở URL là 1 side effect tức thời, không phải
// animation có trạng thái) — chỉ Builder canvas mới cần 1 khung tĩnh để còn chọn/kéo được.
export default function LinkOpenerView({
  component,
  data,
  sequence,
}: {
  component: LinkOpenerComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  useTriggerCommands(component.triggerActions, sequence, (command) => {
    if (command !== "LinkOpener.Open") return;
    const winnerRow = data?.results?.[0];
    const participant = winnerRow ? data?.participants.find((p) => p.id === winnerRow.participant_id) : undefined;
    const url = participant ? getParticipantField(participant, component.props.urlField) : "";
    // Chưa có winner hoặc field rỗng — no-op im lặng, không báo lỗi gì (đã xác nhận với user, giữ
    // Button hoàn toàn không cần biết disable lúc nào — Button vẫn luôn bấm được và luôn emit).
    if (!url) return;
    window.api.shell.openExternal(url);
  });

  if (!sequence) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold-300/60 bg-gold-500 text-[11px] font-medium text-white shadow-md">
        <LinkIcon />
        Link Opener
      </div>
    );
  }

  return null;
}
