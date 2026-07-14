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

/**
 * Chọn 1 người trúng thưởng dựa trên trọng số của các giải còn lại trong phiên.
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
 */
export function drawOne({ sessionId }: DrawOptions): DrawResult {
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as any;
  if (!session) throw new Error("Không tìm thấy phiên quay số");

  const activePrizes = db
    .prepare(`SELECT * FROM prizes WHERE session_id = ? AND remaining > 0 AND status = 'active'`)
    .all(sessionId) as any[];

  if (activePrizes.length === 0) {
    throw new Error("Không còn giải nào khả dụng trong phiên này (đã hết số lượng hoặc đang bị tạm ẩn)");
  }

  let baseQuery = `SELECT * FROM participants WHERE session_id = ? AND status = 'active'`;
  const baseParams: any[] = [sessionId];
  if (session.exclude_previous_winners) {
    baseQuery += ` AND id NOT IN (SELECT participant_id FROM draw_results WHERE session_id = ?)`;
    baseParams.push(sessionId);
  }
  const baseParticipants = db.prepare(baseQuery).all(...baseParams) as any[];

  if (baseParticipants.length === 0) {
    throw new Error("Không còn người chơi nào khả dụng để quay");
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
  // loại giải đó và roll lại trong phần còn lại.
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
    throw new Error("Không tìm được người chơi phù hợp cho bất kỳ giải nào còn lại (đã áp hết quy tắc trùng lặp)");
  }

  const idx = randomInt(0, eligibleParticipants.length);
  const chosenParticipant = eligibleParticipants[idx];
  const seed = randomUUID();
  const resultId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO draw_results (id, session_id, participant_id, prize_id, rng_seed) VALUES (?, ?, ?, ?, ?)`
    ).run(resultId, sessionId, chosenParticipant.id, chosenPrize.id, seed);
    db.prepare(`UPDATE prizes SET remaining = remaining - 1 WHERE id = ?`).run(chosenPrize.id);
  });
  tx();

  return {
    participantId: chosenParticipant.id,
    participantName: chosenParticipant.name,
    prizeId: chosenPrize.id,
    prizeName: chosenPrize.name,
    seed,
  };
}
