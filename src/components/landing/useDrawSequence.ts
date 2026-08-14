import { useEffect, useMemo, useRef, useState } from "react";
import { DrawCandidate, DrawResultRow } from "@/types";
import { DrawSequenceActions, LandingData } from "@/lib/landing/types";

// Hook trung tâm cho luồng Button Draw/Confirm/Redo trên Landing Page (Present Mode only).
// pick() gọi draw:pick — CHỌN nhưng CHƯA ghi DB — giữ candidate trong state để hiện lên màn hình
// cho tới khi confirm() ghi thật (draw:commit) hoặc redo() loại candidate rồi pick lại ĐÚNG giải
// đó (lockedPrizeId), cộng dồn participant bị loại (excludeIds) qua các lần Redo liên tiếp.
// Không có timer/tự chuyển trạng thái nào — hoàn toàn do người vận hành bấm nút, đúng tinh thần
// "landing chỉ render, không tự quyết định gì" đã áp dụng xuyên suốt tính năng này.
//
// effectiveData "độn" candidate đang chờ vào ĐẦU mảng results dưới dạng 1 DrawResultRow giả
// (id: "pending-<seed>") — nhờ vậy MỌI component đọc data (WinnerNameView/PrizeImageView remount
// theo results[0]?.id, xem REMOUNT_ON_RESULT_TYPES trong LandingRenderer.tsx; Lucky Wheel tự dò
// results[0].id đổi để bắt đầu quay, xem WheelTemplate.tsx) tự nhận ra "có kết quả mới" mà không
// cần biết gì về pick()/confirm(). Sau khi Confirm, vẫn tiếp tục hiện candidate này (không đổi sang
// row thật từ DB) để không bị đổi id gây tự động quay lại lần nữa.
// Nếu 1 lời gọi IPC không bao giờ resolve/reject (vd preload cũ do quên khởi động lại electron:dev
// sau khi sửa electron/, hoặc round-trip IPC bị rớt) thì `busy` sẽ giữ `true` MÃI MÃI — khoá CẢ 3
// nút Draw/Confirm/Redo vĩnh viễn, không có lỗi nào hiện ra để biết vì sao (đã gặp thật). Đặt trần
// thời gian chờ để luôn tự thoát ra lỗi rõ ràng thay vì treo im lặng — 1 câu SQLite cục bộ bình
// thường chỉ mất vài ms, 10s là quá đủ dư cho máy chậm.
//
// scoreboardVisible là state ẩn/hiện độc lập hoàn toàn với candidate/busy ở trên — không có IPC,
// không timeout, chỉ toggle 1 boolean cho Button action "showScoreboard" (xem ButtonView.tsx) và
// component Scoreboard đọc lại (xem LandingRenderer.tsx, ScoreboardView.tsx).
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
  const [scoreboardVisible, setScoreboardVisible] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState<{ message: string } | null>(null);
  const pendingConfirmActionRef = useRef<(() => void) | null>(null);
  const excludeIdsRef = useRef<string[]>([]);
  const lockedPrizeIdRef = useRef<string | null>(null);
  // Giải đang được CHỌN qua PrizeGalleryView.tsx — xem doc-comment DrawSequenceActions.selectedPrizeId
  // trong types.ts. Độc lập hoàn toàn với candidate/busy — thuần UI, không có IPC nào cho riêng nó.
  const [selectedPrizeId, setSelectedPrizeId] = useState<string | null>(null);
  const [outOfStockPrizeName, setOutOfStockPrizeName] = useState<string | null>(null);

  const isPending = candidate !== null && !confirmed;

  async function pick() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await withTimeout(
        window.api.draw.pick({ sessionId, lockedPrizeId: selectedPrizeId ?? undefined }),
        "Draw"
      );
      setCandidate(next);
      setConfirmed(false);
      excludeIdsRef.current = [];
      lockedPrizeIdRef.current = next.prizeId;
    } catch (e: any) {
      setError(e?.message ?? "Draw failed");
      // Bắn lại lỗi (khác confirm()/redo()) — ButtonView.tsx bắt lỗi này để không làm gì thêm,
      // sequence.error đã đủ để hiện ra cho người vận hành thấy.
      throw e;
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
    } catch (e: any) {
      setError(e?.message ?? "Redo failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetSession() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await withTimeout(window.api.draw.resetSession(sessionId), "Reset");
      setCandidate(null);
      setConfirmed(false);
      excludeIdsRef.current = [];
      lockedPrizeIdRef.current = null;
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleScoreboard() {
    setScoreboardVisible((v) => !v);
  }

  function hideScoreboard() {
    setScoreboardVisible(false);
  }

  // Click 1 ảnh giải trong PrizeGalleryView.tsx — click lại ĐÚNG giải đang chọn thì bỏ chọn, click
  // giải KHÁC thì chuyển sang giải đó luôn (không cần bỏ chọn giải cũ trước).
  function togglePrizeSelection(prizeId: string) {
    setSelectedPrizeId((cur) => (cur === prizeId ? null : prizeId));
  }

  function notifyOutOfStock(prizeName: string) {
    setOutOfStockPrizeName(prizeName);
  }

  function dismissOutOfStock() {
    setOutOfStockPrizeName(null);
  }

  // Tự phát hiện giải ĐANG CHỌN vừa hết hàng (remaining về 0, thường ngay sau Confirm) — chủ động
  // bỏ chọn + báo popup ngay lúc đó, không đợi người vận hành bấm Draw rồi mới thấy lỗi chung chung.
  useEffect(() => {
    if (!selectedPrizeId) return;
    const prize = data.prizes.find((p) => p.id === selectedPrizeId);
    if (prize && prize.remaining <= 0) {
      setSelectedPrizeId(null);
      setOutOfStockPrizeName(prize.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.prizes, selectedPrizeId]);

  // Popup xác nhận chung — xem comment ở DrawSequenceActions trong types.ts. `action` giữ trong ref
  // (không phải state) vì bản thân nó là 1 closure/hàm, không cần re-render khi gán.
  function requestConfirm(message: string, action: () => void) {
    pendingConfirmActionRef.current = action;
    setConfirmPrompt({ message });
  }

  function resolveConfirmPrompt(confirmed: boolean) {
    const action = pendingConfirmActionRef.current;
    pendingConfirmActionRef.current = null;
    setConfirmPrompt(null);
    if (confirmed && action) action();
  }

  const effectiveData = useMemo<LandingData>(() => {
    if (!candidate) return data;
    const participant = data.participants.find((p) => p.id === candidate.participantId);
    const prize = data.prizes.find((p) => p.id === candidate.prizeId);
    const synthetic: DrawResultRow = {
      id: `pending-${candidate.seed}`,
      session_id: sessionId ?? "",
      participant_id: candidate.participantId,
      prize_id: candidate.prizeId,
      participant_name: candidate.participantName,
      participant_code: participant?.code ?? null,
      participant_phone: participant?.phone ?? null,
      participant_email: participant?.email ?? null,
      prize_name: candidate.prizeName,
      prize_code: prize?.code ?? null,
      prize_display_image: prize?.display_image ?? null,
      drawn_at: new Date().toISOString(),
      rng_seed: candidate.seed,
    };
    return { ...data, results: [synthetic, ...data.results] };
  }, [candidate, data, sessionId]);

  return {
    candidate,
    isPending,
    busy,
    error,
    pick,
    confirm,
    redo,
    scoreboardVisible,
    toggleScoreboard,
    hideScoreboard,
    resetSession,
    confirmPrompt,
    requestConfirm,
    resolveConfirmPrompt,
    selectedPrizeId,
    togglePrizeSelection,
    outOfStockPrizeName,
    notifyOutOfStock,
    dismissOutOfStock,
    effectiveData,
  };
}
