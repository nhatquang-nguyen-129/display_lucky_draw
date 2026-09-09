import { useEffect, useState } from "react";
import { Stat, StatSection } from "@/components/StatSection";
import { useSession } from "@/context/SessionContext";
import { DrawResultRow, Participant, Prize } from "@/types";

type ParticipantStats = { original: number; current: number; removed: number };

export default function Dashboard() {
  const { activeSessionId, activeSession } = useSession();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [results, setResults] = useState<DrawResultRow[]>([]);
  const [stats, setStats] = useState<ParticipantStats>({ original: 0, current: 0, removed: 0 });

  useEffect(() => {
    if (!activeSessionId) {
      setParticipants([]);
      setPrizes([]);
      setResults([]);
      setStats({ original: 0, current: 0, removed: 0 });
      return;
    }
    window.api.participants.list(activeSessionId).then(setParticipants);
    window.api.participants.stats(activeSessionId).then(setStats);
    window.api.prizes.list(activeSessionId).then(setPrizes);
    window.api.sessions.results(activeSessionId).then(setResults);
  }, [activeSessionId]);

  const totalPrizes = prizes.reduce((s, p) => s + p.quantity, 0);
  const awarded = prizes.reduce((s, p) => s + (p.quantity - p.remaining), 0);
  const remaining = prizes.reduce((s, p) => s + p.remaining, 0);

  // Tỷ lệ hao hụt sau khi dọn dữ liệu đầu vào (dedup + xoá dòng sai) — cho biết list gốc "bẩn" tới mức nào.
  const removedPct = stats.original > 0 ? Math.round((stats.removed / stats.original) * 100) : 0;

  // Số người đã trúng ít nhất 1 giải — distinct participant_id, KHÁC "Awarded" (đếm suất giải):
  // 1 người có thể trúng nhiều giải, hoặc Quick Draw trao nhiều suất cùng lúc.
  const winners = new Set(results.map((r) => r.participant_id)).size;
  const notWonYet = Math.max(participants.length - winners, 0);
  // Suất giải trung bình mỗi người trúng — > 1 khi có giải cho phép trùng người / Quick Draw.
  const avgPerWinner = winners > 0 ? (awarded / winners).toFixed(1) : "0";

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <StatSection title="Participants">
        <Stat label="Imported" value={stats.original} />
        <Stat label="Removed" value={stats.removed} />
        <Stat label="Removed %" value={`${removedPct}%`} />
        <Stat label="Active" value={participants.length} accent="gold" />
      </StatSection>

      <StatSection title="Prizes">
        <Stat label="Total" value={totalPrizes} />
        <Stat label="Types" value={prizes.length} />
        <Stat label="Awarded" value={awarded} accent="teal" />
        <Stat label="Remaining" value={remaining} />
      </StatSection>

      <StatSection title="Draw results">
        <Stat label="Winners" value={winners} accent="teal" />
        <Stat label="Not won yet" value={notWonYet} />
        <Stat label="Avg / winner" value={avgPerWinner} />
        <Stat label="Total draws" value={results.length} />
      </StatSection>
    </div>
  );
}
