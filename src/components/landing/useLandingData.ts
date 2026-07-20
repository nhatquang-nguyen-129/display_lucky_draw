import { useEffect, useState } from "react";
import { DrawResultRow, Participant, Prize } from "@/types";
import { LandingData } from "@/lib/landing/types";

const POLL_MS = 2000;

// Nơi fetch/poll DUY NHẤT cho dữ liệu sống (participants/prizes/kết quả quay) — dùng chung bởi
// PresentMode (cửa sổ trình chiếu) và Preview trong Builder, để mọi component "động" (Lucky Wheel,
// Winner Name...) đều đọc từ đúng 1 nguồn, không component nào tự fetch riêng.
export function useLandingData(sessionId: string | null): LandingData {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [results, setResults] = useState<DrawResultRow[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setParticipants([]);
      setPrizes([]);
      setResults([]);
      return;
    }
    const load = () => {
      window.api.participants.list(sessionId).then(setParticipants);
      window.api.prizes.list(sessionId).then(setPrizes);
      window.api.sessions.results(sessionId).then(setResults);
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [sessionId]);

  return { participants, prizes, results };
}
