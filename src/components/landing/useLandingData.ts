import { useCallback, useEffect, useState } from "react";
import { DrawResultRow, Participant, Prize } from "@/types";
import { LandingData } from "@/lib/landing/types";

const POLL_MS = 2000;

// Nơi fetch/poll DUY NHẤT cho dữ liệu sống (participants/prizes/kết quả quay) — dùng chung bởi
// PresentMode (cửa sổ trình chiếu) và Preview trong Builder, để mọi component "động" (Lucky Wheel,
// Winner Name...) đều đọc từ đúng 1 nguồn, không component nào tự fetch riêng.
//
// `refresh` — gọi lại NGAY 1 lần thay vì đợi tới POLL_MS tiếp theo (tối đa 2s) — dùng bởi
// useDrawSequence.ts SAU KHI 1 hành động ghi DB thật (Confirm/Reset) hoàn tất, để tránh đúng cửa sổ
// hở dữ liệu CŨ vẫn còn hiện trong lúc chờ poll bắt kịp (đã gặp thật: Reset xong bấm chọn giải ngay
// bị báo "hết hàng" sai vì `prizes` trong bộ nhớ chưa kịp cập nhật remaining mới) — xem
// useDrawSequence.ts's resetSession()/confirm().
export function useLandingData(sessionId: string | null): LandingData & { refresh: () => Promise<void> } {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [results, setResults] = useState<DrawResultRow[]>([]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const [p, pr, r] = await Promise.all([
      window.api.participants.list(sessionId),
      window.api.prizes.list(sessionId),
      window.api.sessions.results(sessionId),
    ]);
    setParticipants(p);
    setPrizes(pr);
    setResults(r);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setParticipants([]);
      setPrizes([]);
      setResults([]);
      return;
    }
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [sessionId, refresh]);

  return { participants, prizes, results, refresh };
}
