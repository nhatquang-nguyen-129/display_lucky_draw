import { randomUUID, randomInt } from "crypto";
import { db } from "./db";

export interface DrawOptions {
  sessionId: string;
}

export interface DrawResult {
  participantId: string;
  participantName: string;
  prizeId: string;
  prizeName: string;
  seed: string;
}

// Ứng viên đã CHỌN nhưng CHƯA ghi DB — dùng cho luồng Button "Draw" trên Landing Page, cần xem
// trước kết quả trước khi Xác nhận (Confirm) hoặc loại bỏ để quay lại (Redo). Cùng shape với
// DrawResult vì bản chất là 1 — chỉ khác ở chỗ chưa persist.
export type DrawCandidate = DrawResult;

export interface PickWinnerOptions extends DrawOptions {
  // Redo: participant vừa bị loại (và mọi participant bị loại trước đó trong cùng chuỗi Redo)
  // không được chọn lại ở lần pick tiếp theo.
  excludeParticipantIds?: string[];
  // Redo: giữ nguyên đúng giải đã chọn ở lần pick trước ("tiếp tục quay giải đó"), bỏ qua hẳn
  // bước random chọn giải theo trọng số — chỉ random lại người trong pool của giải này.
  lockedPrizeId?: string;
}

/**
 * Chọn 1 người trúng thưởng dựa trên trọng số của các giải còn lại trong phiên — CHỈ chọn, KHÔNG
 * ghi DB (xem commitDraw). Tách riêng để phục vụ luồng Button "Draw" trên Landing Page, nơi cần
 * xem trước ứng viên rồi mới Confirm/Redo, thay vì ghi nhận ngay như nút "Draw now" cũ.
 *
 * Quy tắc cấp SESSION (đặt ở "Tuỳ chọn phiên"):
 * - exclude_previous_winners = 1: participant đã trúng bất kỳ giải nào trong session
 *   sẽ bị loại hoàn toàn khỏi mọi lượt quay sau đó.
 *
 * Quy tắc cấp GIẢI THƯỞNG (đặt trong popup thêm/sửa giải, ưu tiên áp dụng CHI TIẾT hơn session):
 * - status != 'active': giải bị tạm ẩn, không đưa vào vòng quay.
 * - allow_duplicate_with_same_prize + max_win_count: 1 người được trúng ĐÚNG giải này tối đa bao nhiêu lần.
 * - allow_duplicate_with_other_prizes = 0: người đã trúng BẤT KỲ giải nào khác trong session
 *   sẽ không đủ điều kiện trúng giải này nữa.
 *
 * Vì điều kiện phụ thuộc vào từng giải cụ thể, thuật toán chọn giải theo trọng số trước,
 * nếu giải đó không còn ai đủ điều kiện thì loại giải đó khỏi vòng quay lần này và roll lại
 * trong các giải còn lại — tránh việc "chọn trúng giải nhưng không ai nhận được" gây lỗi ngầm.
 *
 * excludeParticipantIds/lockedPrizeId phục vụ đúng 1 use-case: Button "Redo" trên Landing Page —
 * loại participant vừa bị từ chối và BẮT BUỘC quay lại đúng giải cũ, không random giải lại.
 */
export function pickWinner({ sessionId, excludeParticipantIds = [], lockedPrizeId }: PickWinnerOptions): DrawCandidate {
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as any;
  if (!session) throw new Error("Draw session not found");

  let activePrizes = db
    .prepare(`SELECT * FROM prizes WHERE session_id = ? AND remaining > 0 AND status = 'active'`)
    .all(sessionId) as any[];

  if (lockedPrizeId) {
    activePrizes = activePrizes.filter((p) => p.id === lockedPrizeId);
    if (activePrizes.length === 0) {
      throw new Error("The locked prize is no longer available (out of stock or hidden)");
    }
  }

  if (activePrizes.length === 0) {
    throw new Error("No prizes available in this session (out of stock or hidden)");
  }

  let baseQuery = `SELECT * FROM participants WHERE session_id = ? AND status = 'active'`;
  const baseParams: any[] = [sessionId];
  if (session.exclude_previous_winners) {
    baseQuery += ` AND id NOT IN (SELECT participant_id FROM draw_results WHERE session_id = ?)`;
    baseParams.push(sessionId);
  }
  let baseParticipants = db.prepare(baseQuery).all(...baseParams) as any[];
  if (excludeParticipantIds.length > 0) {
    const excluded = new Set(excludeParticipantIds);
    baseParticipants = baseParticipants.filter((p) => !excluded.has(p.id));
  }

  if (baseParticipants.length === 0) {
    throw new Error("No participants available to draw");
  }

  // Lịch sử trúng thưởng trong session — dùng để áp quy tắc trùng lặp cấp giải
  const winRows = db
    .prepare(
      `SELECT participant_id, prize_id, COUNT(*) as cnt FROM draw_results WHERE session_id = ? GROUP BY participant_id, prize_id`
    )
    .all(sessionId) as { participant_id: string; prize_id: string; cnt: number }[];
  const winCountMap = new Map<string, number>();
  winRows.forEach((w) => winCountMap.set(`${w.participant_id}|${w.prize_id}`, w.cnt));

  const anyWinParticipants = new Set(
    (
      db.prepare(`SELECT DISTINCT participant_id FROM draw_results WHERE session_id = ?`).all(sessionId) as {
        participant_id: string;
      }[]
    ).map((r) => r.participant_id)
  );

  function eligibleParticipantsForPrize(prize: any) {
    return baseParticipants.filter((p) => {
      const timesWonThisPrize = winCountMap.get(`${p.id}|${prize.id}`) ?? 0;
      const maxAllowed = prize.allow_duplicate_with_same_prize ? prize.max_win_count : 1;
      if (timesWonThisPrize >= maxAllowed) return false;
      if (!prize.allow_duplicate_with_other_prizes && anyWinParticipants.has(p.id)) return false;
      return true;
    });
  }

  // Weighted random chọn giải — nếu giải chọn trúng không còn ai đủ điều kiện,
  // loại giải đó và roll lại trong phần còn lại. Khi lockedPrizeId có giá trị, activePrizes chỉ
  // còn đúng 1 giải nên vòng lặp này thực chất chỉ kiểm tra eligibility của đúng giải đó.
  let candidatePrizes = activePrizes.slice();
  let chosenPrize: any = null;
  let eligibleParticipants: any[] = [];

  while (candidatePrizes.length > 0) {
    const totalWeight = candidatePrizes.reduce((sum, p) => sum + p.weight, 0);
    let threshold = Math.random() * totalWeight;
    let picked = candidatePrizes[candidatePrizes.length - 1];
    for (const prize of candidatePrizes) {
      threshold -= prize.weight;
      if (threshold <= 0) {
        picked = prize;
        break;
      }
    }
    const eligible = eligibleParticipantsForPrize(picked);
    if (eligible.length > 0) {
      chosenPrize = picked;
      eligibleParticipants = eligible;
      break;
    }
    candidatePrizes = candidatePrizes.filter((p) => p.id !== picked.id);
  }

  if (!chosenPrize) {
    throw new Error(
      lockedPrizeId
        ? "No eligible participant left for this prize"
        : "No eligible participant found for any remaining prize (all duplicate rules exhausted)"
    );
  }

  const idx = randomInt(0, eligibleParticipants.length);
  const chosenParticipant = eligibleParticipants[idx];

  return {
    participantId: chosenParticipant.id,
    participantName: chosenParticipant.name,
    prizeId: chosenPrize.id,
    prizeName: chosenPrize.name,
    seed: randomUUID(),
  };
}

/** Ghi nhận chính thức 1 candidate đã pickWinner() vào DB — đúng phần transaction mà drawOne() cũ
 * vẫn làm. Tách riêng để Button "Confirm" trên Landing Page gọi sau khi đã xem trước ứng viên. */
export function commitDraw(candidate: DrawCandidate, sessionId: string): void {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO draw_results (id, session_id, participant_id, prize_id, rng_seed) VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), sessionId, candidate.participantId, candidate.prizeId, candidate.seed);
    db.prepare(`UPDATE prizes SET remaining = remaining - 1 WHERE id = ?`).run(candidate.prizeId);
  });
  tx();
}

/** Hành vi cũ (nút "Draw now" ở trang Draw) — chọn rồi ghi nhận ngay lập tức, không qua bước xem
 * trước. Giữ nguyên chữ ký/hành vi để không ảnh hưởng gì tới màn hình Draw hiện có. */
export function drawOne(opts: DrawOptions): DrawResult {
  const candidate = pickWinner(opts);
  commitDraw(candidate, opts.sessionId);
  return candidate;
}
