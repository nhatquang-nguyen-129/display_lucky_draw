import { useEffect, useMemo, useRef, useState } from "react";
import { DrawCandidate, DrawResultRow, Prize } from "@/types";
import { DrawMode, DrawSequenceActions, LandingData } from "@/lib/landing/types";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// Nhịp nghỉ MẶC ĐỊNH giữa mỗi người trong Multiple Draw (SAU khi 1 người đã Confirm xong, TRƯỚC khi
// pick người tiếp theo) — CHỈ dùng khi Button không có `multipleDrawPaceMs` riêng (landing cũ lưu
// trước khi có field này, xem ButtonProps.multipleDrawPaceMs trong types.ts). Bình thường
// ButtonView.tsx luôn truyền số thật vào runDraw()/runMultipleDrawInternal() bên dưới. Quick Draw
// KHÔNG dùng hằng số này — chạy liên tục không nghỉ.
const DEFAULT_MULTIPLE_DRAW_PACE_MS = 600;

export function useDrawSequence(
  sessionId: string | null,
  data: LandingData,
  // Gọi lại NGAY sau khi Confirm/Reset ghi DB xong (thay vì đợi tới POLL_MS tiếp theo của
  // useLandingData.ts, tối đa 2s) — cả 2 hành động đều đổi `prizes.remaining`, và PrizeImageView.tsx
  // đọc thẳng `remaining` từ `data` để quyết định 1 giải còn chọn được hay không.
  // Thiếu bước này thì có 1 khoảng hở: bấm Reset/Confirm xong, bấm chọn giải NGAY trong lúc `data`
  // trong bộ nhớ chưa kịp cập nhật → báo "hết hàng" sai (đã gặp thật với Reset). `busy` giữ `true`
  // xuyên suốt cả bước gọi lại này (xem confirm()/resetSession() bên dưới), nên UI (popup loading —
  // xem LandingRenderer.tsx) tự nhiên chặn thao tác trong đúng khoảng hở đó.
  refreshData: () => Promise<void>,
  // Thời lượng (ms) Lucky Wheel trên trang quay xong hẳn kể từ lúc có candidate mới — CÙNG 1 mốc
  // WinnerNameView.tsx/BackgroundDimOverlay.tsx dùng (xem computeWheelRevealDelayMs trong types.ts),
  // tính sẵn ở PresentMode.tsx (nơi có `config`, hook này không có). Dùng để tự khoá `spinning` đúng
  // khoảng thời gian Wheel đang quay — xem startSpinLock() bên dưới.
  winnerRevealDelayMs: number,
  // Trang có ít nhất 1 UI chọn giải (Prize Gallery/Prize Image selectable — xem hasSelectablePrizeUI
  // trong types.ts), tính sẵn ở PresentMode.tsx — true thì Draw BẮT BUỘC phải chọn giải trước (xem
  // pick() bên dưới), tránh quay "trống" không ai biết đang nhắm giải nào trong khi rõ ràng trang có
  // hẳn UI để chọn. Trang không có UI đó thì Draw vẫn random có trọng số như cũ, không đổi gì.
  requiresPrizeSelection: boolean
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
  // Giải đang được CHỌN qua PrizeImageView.tsx — xem doc-comment DrawSequenceActions.selectedPrizeId
  // trong types.ts. Độc lập hoàn toàn với candidate/busy — thuần UI, không có IPC nào cho riêng nó.
  const [selectedPrizeId, setSelectedPrizeId] = useState<string | null>(null);
  // Popup thông báo dùng chung — xem doc-comment DrawSequenceActions.infoPrompt trong types.ts.
  const [infoPrompt, setInfoPrompt] = useState<string | null>(null);
  function showInfoPrompt(message: string) {
    setInfoPrompt(message);
  }
  function dismissInfoPrompt() {
    setInfoPrompt(null);
  }
  // Đang trong khoảng Wheel quay — xem doc-comment DrawSequenceActions.spinning trong types.ts.
  const [spinning, setSpinning] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Multiple/Quick Draw — xem doc-comment DrawSequenceActions.batchProgress/quickDrawResult trong
  // types.ts, và runMultipleDrawInternal/runQuickDrawInternal bên dưới.
  const [batchProgress, setBatchProgress] = useState<{ mode: "multiple" | "quick"; current: number; total: number } | null>(
    null
  );
  const [quickDrawResult, setQuickDrawResult] = useState<{ count: number; prizeName: string } | null>(null);
  // Chế độ Draw ĐANG ĐƯỢC ARM (chọn qua dropdown mũi tên cạnh nút Draw, xem ButtonView.tsx's DrawMenu)
  // — nút Draw CHÍNH chỉ thật sự CHẠY đúng chế độ này khi bấm (xem runDraw() bên dưới), dropdown chỉ
  // CẤU HÌNH, không tự chạy gì. "single" không cần drawCount (luôn null); "multiple"/"quick" cần
  // drawCount (đặt qua popup drawModePrompt, xem confirmDrawModePrompt bên dưới).
  const [drawMode, setDrawMode] = useState<DrawMode>("single");
  const [drawCount, setDrawCount] = useState<number | null>(null);
  const [drawModePrompt, setDrawModePrompt] = useState<{ mode: "multiple" | "quick"; prizeName: string; max: number } | null>(
    null
  );

  // Gọi NGAY sau khi có candidate mới (pick()/redo() thành công) — bắt đầu khoá `spinning` đúng
  // winnerRevealDelayMs, tự mở khoá khi hết giờ. Huỷ timer CŨ trước nếu có (candidate đổi liên tiếp
  // nhanh, vd Redo ngay sau Draw), tránh 2 timer chồng nhau tự mở khoá sớm hơn dự kiến.
  function startSpinLock() {
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    setSpinning(true);
    spinTimerRef.current = setTimeout(() => setSpinning(false), Math.max(0, winnerRevealDelayMs));
  }

  useEffect(
    () => () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    },
    []
  );

  const isPending = candidate !== null && !confirmed;

  async function pick() {
    if (!sessionId || busy || spinning) return;
    // Trang có UI chọn giải nhưng chưa chọn gì — chặn quay "trống", báo rõ lý do bằng popup (giống
    // popup "hết hàng") thay vì cứ random im lặng như không có gì xảy ra (đã gặp thật: quay được dù
    // chưa ai chọn giải, không hình nào được zoom lên cả). Không set `busy`/không gọi IPC gì — chỉ
    // dừng lại đúng đây.
    if (requiresPrizeSelection && !selectedPrizeId) {
      showInfoPrompt("Please select a prize first!");
      return;
    }
    setQuickDrawResult(null);
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
      startSpinLock();
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
    if (!sessionId || busy || spinning) return;
    // Đứng yên (chưa Draw lần nào, hoặc candidate lần trước đã Confirm rồi) — không có gì để ghi cả,
    // báo rõ lý do thay vì no-op im lặng (đã gặp thật: bấm Confirm được dù màn hình đang standby,
    // chưa ai trúng giải gì).
    if (!candidate || confirmed) {
      showInfoPrompt("Please draw a winner first!");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await withTimeout(window.api.draw.commit({ candidate, sessionId }), "Confirm");
      setConfirmed(true);
      // Confirm vừa trừ prizes.remaining thật trong DB — nạp lại NGAY, xem doc-comment refreshData ở trên.
      await withTimeout(refreshData(), "Refresh");
    } catch (e: any) {
      setError(e?.message ?? "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function redo() {
    if (!sessionId || busy || spinning || !candidate || confirmed) return;
    setQuickDrawResult(null);
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
      startSpinLock();
    } catch (e: any) {
      setError(e?.message ?? "Redo failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetSession() {
    if (!sessionId || busy || spinning) return;
    setQuickDrawResult(null);
    setBusy(true);
    setError(null);
    try {
      await withTimeout(window.api.draw.resetSession(sessionId), "Reset");
      // Nạp lại data TRƯỚC khi xoá candidate (thứ tự CỐ Ý, đảo lại so với bản cũ) — xem doc-comment
      // refreshData ở trên. Nếu xoá candidate trước: có 1 khung hình transient candidate = null NHƯNG
      // `data.results` (từ useLandingData.ts) vẫn còn CŨ (chưa kịp refresh) — effectiveData lúc đó rơi
      // về thẳng `data.results` cũ đó (dòng thật cuối cùng trước khi Reset, id KHÁC hẳn id giả
      // "pending-..." mà Wheel đang khoá), khiến WheelTemplate.tsx/DigitRollerTemplate.tsx tưởng có
      // candidate MỚI (results[0].id đổi) và tự quay 1 phát — bug đã gặp thật. Refresh trước thì lúc
      // candidate còn set, effectiveData vẫn đang overlay đúng row giả cũ (không đổi id, Wheel không
      // phản ứng gì); tới khi candidate = null, `data.results` đã rỗng thật sự (results[0] = undefined,
      // WheelTemplate tự bỏ qua id undefined) — không còn khung hình "id thật lạ" nào lọt qua nữa.
      await withTimeout(refreshData(), "Refresh");
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

  // Multiple/Quick Draw đều BẮT BUỘC có selectedPrizeId (khác Single Draw, không phụ thuộc
  // requiresPrizeSelection) — 2 chế độ này thao tác hàng loạt trên ĐÚNG 1 giải cụ thể, không có khái
  // niệm "chạy trên toàn bộ giải ngẫu nhiên". Trả về giải đó (đã kiểm remaining > 0) hoặc null nếu
  // chưa chọn/giải không còn tồn tại trong `data.prizes` — cả 2 hàm bên dưới tự hiện popup phù hợp và
  // dừng lại khi null.
  function requireSelectedPrizeForBatch(): Prize | null {
    if (!selectedPrizeId) {
      showInfoPrompt("Please select a prize first!");
      return null;
    }
    const prize = data.prizes.find((p) => p.id === selectedPrizeId);
    if (!prize) {
      showInfoPrompt("Please select a prize first!");
      return null;
    }
    return prize;
  }

  // Lặp lại ĐÚNG quy trình Single Draw (pick → chờ Wheel hiện xong đúng winnerRevealDelayMs → tự
  // Confirm → nghỉ ngắn `paceMs`, xem ButtonProps.multipleDrawPaceMs trong types.ts) `count` lần liên
  // tiếp — KHÔNG tái dùng nội bộ pick()/confirm() (tự gọi thẳng window.api.draw.pick/commit, y hệt
  // logic bên trong 2 hàm đó) để không có rủi ro động vào luồng thủ công đã ổn định. `spinning = true`
  // SUỐT cả vòng lặp (không chỉ 1 winnerRevealDelayMs mỗi lượt như startSpinLock()) — tái dùng
  // NGUYÊN VẸN mọi điểm khoá đã đọc spinning (ButtonView.tsx, PrizeImageView.tsx...) mà không cần sửa
  // gì thêm ở đó, đúng tinh thần "batch draw là 1 dạng mở rộng của đang quay".
  async function runMultipleDrawInternal(count: number, paceMs: number) {
    if (!sessionId || busy || spinning || batchProgress) return;
    const prize = requireSelectedPrizeForBatch();
    if (!prize) return;
    if (!Number.isFinite(count) || count < 1 || count > prize.remaining) {
      showInfoPrompt(`Please enter a number between 1 and ${prize.remaining} (remaining for "${prize.name}").`);
      return;
    }
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    setQuickDrawResult(null);
    setError(null);
    setSpinning(true);
    for (let i = 0; i < count; i++) {
      setBatchProgress({ mode: "multiple", current: i + 1, total: count });
      setBusy(true);
      let next: DrawCandidate;
      try {
        next = await withTimeout(window.api.draw.pick({ sessionId, lockedPrizeId: prize.id }), "Draw");
      } catch (e: any) {
        setError(e?.message ?? "Draw failed");
        setBusy(false);
        break;
      }
      setCandidate(next);
      setConfirmed(false);
      excludeIdsRef.current = [];
      lockedPrizeIdRef.current = next.prizeId;
      setBusy(false);
      await sleep(winnerRevealDelayMs);
      setBusy(true);
      try {
        await withTimeout(window.api.draw.commit({ candidate: next, sessionId }), "Confirm");
        setConfirmed(true);
        await withTimeout(refreshData(), "Refresh");
      } catch (e: any) {
        setError(e?.message ?? "Confirm failed");
        setBusy(false);
        break;
      }
      setBusy(false);
      if (i < count - 1) await sleep(paceMs);
    }
    setBatchProgress(null);
    setSpinning(false);
  }

  // Bấm 1 mục trong dropdown mũi tên (DrawMenu, ButtonView.tsx) — "single" set thẳng, không cần hỏi
  // gì (không có số lượng để nhập). "multiple"/"quick" phải CHỌN GIẢI trước (bắt buộc, không phụ
  // thuộc requiresPrizeSelection — xem requireSelectedPrizeForBatch) rồi mở popup nhập số lượng
  // (drawModePrompt, vẽ ở LandingRenderer.tsx qua DrawModeCountPopup.tsx) — CHỈ khi hợp lệ, tránh mở
  // 1 popup nhập số vô nghĩa rồi mới báo lỗi.
  function selectDrawMode(mode: DrawMode) {
    if (!sessionId || busy || spinning || batchProgress) return;
    if (mode === "single") {
      setDrawMode("single");
      setDrawCount(null);
      return;
    }
    const prize = requireSelectedPrizeForBatch();
    if (!prize) return;
    if (prize.remaining < 1) {
      notifyOutOfStock(prize.name);
      return;
    }
    setDrawModePrompt({ mode, prizeName: prize.name, max: prize.remaining });
  }

  function closeDrawModePrompt() {
    setDrawModePrompt(null);
  }

  // ARM chế độ + số lượng đã nhập — CHƯA chạy gì cả, chỉ đóng popup. Nút Draw CHÍNH mới thật sự chạy
  // (xem runDraw() bên dưới) khi người vận hành bấm nó, đúng ý "chọn mode xong bấm Draw để tiến hành".
  function confirmDrawModePrompt(count: number) {
    if (!drawModePrompt) return;
    setDrawMode(drawModePrompt.mode);
    setDrawCount(count);
    setDrawModePrompt(null);
  }

  // Hàm THẬT SỰ chạy khi bấm nút Draw chính (ButtonView.tsx's runAction, case "draw") — rẽ nhánh theo
  // drawMode đang ARM. "multiple"/"quick" tự re-validate count/remaining MỚI NHẤT bên trong
  // runMultipleDrawInternal/runQuickDrawInternal (phòng trường hợp remaining đổi từ lúc arm tới lúc
  // bấm Draw, hoặc đổi sang giải khác) — không hợp lệ thì tự báo popup, không chạy gì. "single" giữ
  // NGUYÊN hành vi cũ: đang có candidate CHỜ CONFIRM (isPending) thì "quay lại" (redo), chưa có gì
  // chờ thì pick() 1 candidate mới — pick() có thể throw (hết participant/prize, lỗi IPC...), tự bắt
  // ở đây (sequence.error đã đủ để hiện ra, không cần ném tiếp ra ButtonView.tsx nữa).
  // `multipleDrawPaceMs` — ButtonView.tsx truyền thẳng component.props.multipleDrawPaceMs, CHỈ dùng
  // khi drawMode === "multiple" (Quick Draw luôn chạy không nghỉ, bỏ qua tham số này hoàn toàn).
  async function runDraw(multipleDrawPaceMs?: number) {
    if (drawMode === "multiple" && drawCount) {
      await runMultipleDrawInternal(drawCount, multipleDrawPaceMs ?? DEFAULT_MULTIPLE_DRAW_PACE_MS);
      return;
    }
    if (drawMode === "quick" && drawCount) {
      await runQuickDrawInternal(drawCount);
      return;
    }
    if (isPending) {
      await redo();
      return;
    }
    try {
      await pick();
    } catch {
      // Lỗi đã tự setError bên trong pick() — không cần làm gì thêm ở đây.
    }
  }

  // Quay + Confirm ĐÚNG `count` người, NHANH NHẤT có thể (không sleep giữa các lượt như Multiple Draw
  // ở trên) — xong thì mở Scoreboard + set quickDrawResult cho WinnerNameView.tsx hiện quickDrawText
  // thay vì tên (nhiều người trúng cùng lúc, không có 1 tên "đúng" nào để hiện).
  async function runQuickDrawInternal(count: number) {
    if (!sessionId || busy || spinning || batchProgress) return;
    const prize = requireSelectedPrizeForBatch();
    if (!prize) return;
    if (!Number.isFinite(count) || count < 1 || count > prize.remaining) {
      showInfoPrompt(`Please enter a number between 1 and ${prize.remaining} (remaining for "${prize.name}").`);
      return;
    }
    const total = count;
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    setQuickDrawResult(null);
    setError(null);
    setSpinning(true);
    let confirmedCount = 0;
    for (let i = 0; i < total; i++) {
      setBatchProgress({ mode: "quick", current: i + 1, total });
      setBusy(true);
      let next: DrawCandidate;
      try {
        next = await withTimeout(window.api.draw.pick({ sessionId, lockedPrizeId: prize.id }), "Draw");
      } catch (e: any) {
        setError(e?.message ?? "Draw failed");
        setBusy(false);
        break;
      }
      try {
        await withTimeout(window.api.draw.commit({ candidate: next, sessionId }), "Confirm");
      } catch (e: any) {
        setError(e?.message ?? "Confirm failed");
        setBusy(false);
        break;
      }
      setCandidate(next);
      setConfirmed(true);
      excludeIdsRef.current = [];
      lockedPrizeIdRef.current = next.prizeId;
      confirmedCount++;
      setBusy(false);
    }
    setBusy(true);
    await withTimeout(refreshData(), "Refresh").catch(() => {});
    setBusy(false);
    setBatchProgress(null);
    setSpinning(false);
    if (confirmedCount > 0) {
      setQuickDrawResult({ count: confirmedCount, prizeName: prize.name });
      setScoreboardVisible(true);
    }
  }

  // Khoá luôn bởi spinning — "gần như mọi chức năng" khoá lúc Wheel đang quay, xem doc-comment
  // DrawSequenceActions.spinning trong types.ts. hideScoreboard() KHÔNG khoá — đóng/dismiss luôn được
  // phép, không phải "hành động mới" nên không có gì rủi ro khi cho phép giữa lúc đang quay.
  function toggleScoreboard() {
    if (spinning) return;
    setScoreboardVisible((v) => !v);
  }

  function hideScoreboard() {
    setScoreboardVisible(false);
  }

  // Click 1 ảnh giải trong PrizeImageView.tsx — click lại ĐÚNG giải đang chọn thì bỏ chọn, click giải
  // KHÁC thì chuyển sang giải đó luôn (không cần bỏ chọn giải cũ trước). Bản thân view đó đã tự chặn
  // gọi hàm này khi đang spinning (giữ nguyên UI, không đổi gì) — chặn thêm ở đây cho chắc, phòng
  // trường hợp có nơi khác gọi thẳng sau này mà quên kiểm tra spinning.
  function togglePrizeSelection(prizeId: string) {
    if (spinning) return;
    setSelectedPrizeId((cur) => (cur === prizeId ? null : prizeId));
  }

  function notifyOutOfStock(prizeName: string) {
    showInfoPrompt(`"${prizeName}" is out of stock!`);
  }

  // Tự phát hiện giải ĐANG CHỌN vừa hết hàng (remaining về 0, thường ngay sau Confirm) — CHỦ ĐỘNG bỏ
  // chọn NHƯNG KHÔNG tự bật popup "hết hàng" (đã bỏ — popup tự bật đúng lúc Wheel/tên người trúng
  // vừa hiện ra làm mất trải nghiệm thị giác). Ảnh giải đó vẫn tự xám ngay vì ô nhìn thẳng
  // `prize.remaining` từ `data`, không cần popup mới báo được là đã hết — popup giờ CHỈ hiện khi
  // người dùng chủ động click lại đúng giải đã xám đó (xem notifyOutOfStock, gọi từ
  // PrizeImageView.tsx). Chờ hết `spinning` mới bỏ chọn — đúng ý "giữ nguyên
  // selection cho tới khi quay xong", tránh giật hình đang zoom/glow ngay giữa lúc Wheel còn đang quay.
  useEffect(() => {
    if (!selectedPrizeId || spinning) return;
    const prize = data.prizes.find((p) => p.id === selectedPrizeId);
    if (prize && prize.remaining <= 0) {
      setSelectedPrizeId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.prizes, selectedPrizeId, spinning]);

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
    infoPrompt,
    notifyOutOfStock,
    dismissInfoPrompt,
    spinning,
    batchProgress,
    quickDrawResult,
    drawMode,
    drawCount,
    selectDrawMode,
    drawModePrompt,
    closeDrawModePrompt,
    confirmDrawModePrompt,
    runDraw,
    effectiveData,
  };
}
