import { useEffect, useState } from "react";
import { Stat, StatSection } from "@/components/StatSection";
import { useSession } from "@/context/SessionContext";
import { DrawHistoryRow, Participant, Prize } from "@/types";

type ParticipantStats = { original: number; current: number; removed: number };

// "datetime('now')" của SQLite trả UTC dạng "YYYY-MM-DD HH:MM:SS" (cách nhau bằng dấu cách, không có
// hậu tố "Z") — new Date(...) parse chuỗi này bị trình duyệt hiểu nhầm là GIỜ ĐỊA PHƯƠNG thay vì UTC.
// Chuyển "YYYY-MM-DD HH:MM:SS" -> ISO 8601 UTC ("...THH:MM:SSZ") trước khi parse để hiện đúng giờ.
function formatDrawnAt(drawnAt: string): string {
  return new Date(`${drawnAt.replace(" ", "T")}Z`).toLocaleString();
}

// Nền cho hàng ĐÃ CONFIRM trong bảng History — 1 hoá màu/giải (cùng giải luôn cùng màu, xoay vòng nếu
// nhiều hơn 10 giải), 3 mức đậm dần theo SỐ LƯỢT đã confirm của ĐÚNG giải đó (giải được confirm nhiều
// hơn thì nền đậm hơn) — chặn trần ở mức 3 (bg-*-500/30) để không bao giờ quá gắt trên nền trắng. Viết
// literal từng class (không ghép chuỗi động) vì Tailwind JIT chỉ nhận diện được class xuất hiện nguyên
// văn trong source. Hàng CHƯA confirm không tô gì — giữ nguyên nền mặc định.
const PRIZE_ROW_BG: readonly [string, string, string][] = [
  ["bg-blue-500/10", "bg-blue-500/20", "bg-blue-500/30"],
  ["bg-purple-500/10", "bg-purple-500/20", "bg-purple-500/30"],
  ["bg-pink-500/10", "bg-pink-500/20", "bg-pink-500/30"],
  ["bg-orange-500/10", "bg-orange-500/20", "bg-orange-500/30"],
  ["bg-emerald-500/10", "bg-emerald-500/20", "bg-emerald-500/30"],
  ["bg-red-500/10", "bg-red-500/20", "bg-red-500/30"],
  ["bg-indigo-500/10", "bg-indigo-500/20", "bg-indigo-500/30"],
  ["bg-amber-500/10", "bg-amber-500/20", "bg-amber-500/30"],
  ["bg-fuchsia-500/10", "bg-fuchsia-500/20", "bg-fuchsia-500/30"],
  ["bg-lime-500/10", "bg-lime-500/20", "bg-lime-500/30"],
];

function confirmedRowBg(prizeId: string, prizeOrder: string[], confirmedCountByPrize: Map<string, number>): string {
  const orderIdx = prizeOrder.indexOf(prizeId);
  const family = PRIZE_ROW_BG[(orderIdx < 0 ? 0 : orderIdx) % PRIZE_ROW_BG.length];
  const count = confirmedCountByPrize.get(prizeId) ?? 1;
  const tier = count <= 1 ? 0 : count <= 3 ? 1 : 2;
  return family[tier];
}

export default function Dashboard() {
  const { activeSessionId, activeSession } = useSession();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [history, setHistory] = useState<DrawHistoryRow[]>([]);
  const [stats, setStats] = useState<ParticipantStats>({ original: 0, current: 0, removed: 0 });

  useEffect(() => {
    if (!activeSessionId) {
      setParticipants([]);
      setPrizes([]);
      setHistory([]);
      setStats({ original: 0, current: 0, removed: 0 });
      return;
    }
    window.api.participants.list(activeSessionId).then(setParticipants);
    window.api.participants.stats(activeSessionId).then(setStats);
    window.api.prizes.list(activeSessionId).then(setPrizes);
    window.api.sessions.drawHistory(activeSessionId).then(setHistory);
  }, [activeSessionId]);

  const totalPrizes = prizes.reduce((s, p) => s + p.quantity, 0);
  const awarded = prizes.reduce((s, p) => s + (p.quantity - p.remaining), 0);

  // "history" gồm CẢ lượt chưa Confirm (bị Redo bỏ dở, xem drawEngine.ts:recordPendingDraw) —
  // confirmedRows mới là "đã thật sự trúng".
  const confirmedRows = history.filter((r) => r.confirmed);
  const prizeOrder = prizes.map((p) => p.id);
  const confirmedCountByPrize = new Map<string, number>();
  confirmedRows.forEach((r) => confirmedCountByPrize.set(r.prize_id, (confirmedCountByPrize.get(r.prize_id) ?? 0) + 1));

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <StatSection>
        <Stat label="Imported participants" value={stats.original} />
        <Stat label="Active participants" value={participants.length} accent="muted" />
        <Stat label="Total prizes" value={totalPrizes} />
        <Stat label="Awarded prizes" value={awarded} accent="muted" />
        <Stat label="Total draws" value={history.length} />
        <Stat label="Confirmed draws" value={confirmedRows.length} accent="muted" />
      </StatSection>

      {/* Log thực tế từng lượt quay, mới nhất trước — kể cả lượt bị Redo bỏ dở (Not confirmed), xem
          drawEngine.ts:recordPendingDraw. Đây là nguồn duy nhất của phần Draw, không tách bảng phụ. */}
      <section className="space-y-3">
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-base-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-base-900 text-xs uppercase tracking-wide text-base-400">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Time</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Prize</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Participant</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800 bg-base-950">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-base-500">
                    No draws yet in this session.
                  </td>
                </tr>
              ) : (
                history.map((r) => (
                  <tr
                    key={r.id}
                    className={`text-base-200 ${
                      r.confirmed ? confirmedRowBg(r.prize_id, prizeOrder, confirmedCountByPrize) : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-base-400">{formatDrawnAt(r.drawn_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.prize_name}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.participant_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-base-400">
                      {r.confirmed ? "Confirmed" : "Not confirmed"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
