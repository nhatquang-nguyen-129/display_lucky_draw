import { useMemo, useRef, useState } from "react";
import { DrawCandidate, DrawResultRow } from "@/types";
import { DrawSequenceActions, LandingData, LastTrigger } from "@/lib/landing/types";

// Hook trung tâm cho luồng Button Draw/Confirm/Redo trên Landing Page (Present Mode only).
// pick() gọi draw:pick — CHỌN nhưng CHƯA ghi DB — giữ candidate trong state để hiện lên màn hình
// cho tới khi confirm() ghi thật (draw:commit) hoặc redo() loại candidate rồi pick lại ĐÚNG giải
// đó (lockedPrizeId), cộng dồn participant bị loại (excludeIds) qua các lần Redo liên tiếp.
// Không có timer/tự chuyển trạng thái nào — hoàn toàn do người vận hành bấm nút, đúng tinh thần
// "landing chỉ render, không tự quyết định gì" đã áp dụng xuyên suốt tính năng này.
//
// effectiveData "độn" candidate đang chờ vào ĐẦU mảng results dưới dạng 1 DrawResultRow giả
// (id: "pending-<seed>") — nhờ vậy mọi view đang có sẵn (LuckyWheelView, WinnerNameView,
// PrizeImageView...) tự nhận ra "có kết quả mới" qua đúng cơ chế results[0]?.id đang dùng, không
// cần sửa gì ở các file đó. Sau khi Confirm, vẫn tiếp tục hiện candidate này (không đổi sang row
// thật từ DB) để không bị đổi id gây tự động quay lại lần nữa.
// Nếu 1 lời gọi IPC không bao giờ resolve/reject (vd preload cũ do quên khởi động lại electron:dev
// sau khi sửa electron/, hoặc round-trip IPC bị rớt) thì `busy` sẽ giữ `true` MÃI MÃI — khoá CẢ 3
// nút Draw/Confirm/Redo vĩnh viễn, không có lỗi nào hiện ra để biết vì sao (đã gặp thật). Đặt trần
// thời gian chờ để luôn tự thoát ra lỗi rõ ràng thay vì treo im lặng — 1 câu SQLite cục bộ bình
// thường chỉ mất vài ms, 10s là quá đủ dư cho máy chậm.
const IPC_TIMEOUT_MS = 10000;
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${IPC_TIMEOUT_MS / 1000}s — the app may need to be restarted (electron:dev doesn't hot-reload electron/ changes).`
            )
          ),
        IPC_TIMEOUT_MS
      )
    ),
  ]);
}

export function useDrawSequence(
  sessionId: string | null,
  data: LandingData
): DrawSequenceActions & { effectiveData: LandingData } {
  const [candidate, setCandidate] = useState<DrawCandidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState<LastTrigger | null>(null);
  const excludeIdsRef = useRef<string[]>([]);
  const lockedPrizeIdRef = useRef<string | null>(null);

  const isPending = candidate !== null && !confirmed;

  async function pick() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await withTimeout(window.api.draw.pick({ sessionId }), "Draw");
      setCandidate(next);
      setConfirmed(false);
      excludeIdsRef.current = [];
      lockedPrizeIdRef.current = next.prizeId;
      setLastTrigger({ event: "draw", firedAt: Date.now() });
    } catch (e: any) {
      setError(e?.message ?? "Draw failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!sessionId || busy || !candidate || confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await withTimeout(window.api.draw.commit({ candidate, sessionId }), "Confirm");
      setConfirmed(true);
      setLastTrigger({ event: "confirm", firedAt: Date.now() });
    } catch (e: any) {
      setError(e?.message ?? "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function redo() {
    if (!sessionId || busy || !candidate || confirmed) return;
    setBusy(true);
    setError(null);
    const nextExcludes = [...excludeIdsRef.current, candidate.participantId];
    try {
      const next = await withTimeout(
        window.api.draw.pick({
          sessionId,
          excludeParticipantIds: nextExcludes,
          lockedPrizeId: lockedPrizeIdRef.current ?? candidate.prizeId,
        }),
        "Redo"
      );
      setCandidate(next);
      excludeIdsRef.current = nextExcludes;
      setLastTrigger({ event: "redo", firedAt: Date.now() });
    } catch (e: any) {
      setError(e?.message ?? "Redo failed");
    } finally {
      setBusy(false);
    }
  }

  const effectiveData = useMemo<LandingData>(() => {
    if (!candidate) return data;
    const prize = data.prizes.find((p) => p.id === candidate.prizeId);
    const synthetic: DrawResultRow = {
      id: `pending-${candidate.seed}`,
      session_id: sessionId ?? "",
      participant_id: candidate.participantId,
      prize_id: candidate.prizeId,
      participant_name: candidate.participantName,
      prize_name: candidate.prizeName,
      prize_display_image: prize?.display_image ?? null,
      drawn_at: new Date().toISOString(),
      rng_seed: candidate.seed,
    };
    return { ...data, results: [synthetic, ...data.results] };
  }, [candidate, data, sessionId]);

  return { candidate, isPending, busy, error, lastTrigger, pick, confirm, redo, effectiveData };
}
