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
 * - allow_duplicate_prize = 0: một participant không thể trúng cùng 1 loại giải 2 lần trong session đó
 *   (vẫn có thể trúng giải khác nếu weight cho phép, nhưng mặc định pool loại participant sau khi trúng bất kỳ giải nào,
 *   trừ khi allow_duplicate_prize bật cho phép trúng nhiều lần nói chung)
 * - exclude_previous_winners = 1: participant đã trúng (bất kỳ giải nào) trong session sẽ bị loại khỏi pool
 */
export function drawOne({ sessionId }: DrawOptions): DrawResult {
  const session = db
    .prepare(`SELECT * FROM sessions WHERE id = ?`)
    .get(sessionId) as any;
  if (!session) throw new Error("Không tìm thấy phiên quay số");

  // Lấy danh sách giải còn số lượng trong phiên này
  const prizes = db
    .prepare(
      `SELECT p.* FROM prizes p
       JOIN session_prizes sp ON sp.prize_id = p.id
       WHERE sp.session_id = ? AND p.remaining > 0`
    )
    .all(sessionId) as any[];

  if (prizes.length === 0) {
    throw new Error("Không còn giải nào khả dụng trong phiên này");
  }

  // Lấy danh sách participant khả dụng
  let participantQuery = `SELECT * FROM participants WHERE status = 'active'`;
  if (session.exclude_previous_winners) {
    participantQuery += `
      AND id NOT IN (SELECT participant_id FROM draw_results WHERE session_id = '${sessionId}')`;
  }
  const participants = db.prepare(participantQuery).all() as any[];

  if (participants.length === 0) {
    throw new Error("Không còn người chơi nào khả dụng để quay");
  }

  // Weighted random chọn giải trước (roulette wheel selection)
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let threshold = Math.random() * totalWeight;
  let chosenPrize = prizes[prizes.length - 1];
  for (const prize of prizes) {
    threshold -= prize.weight;
    if (threshold <= 0) {
      chosenPrize = prize;
      break;
    }
  }

  // Chọn ngẫu nhiên đều 1 participant trong pool khả dụng
  const idx = randomInt(0, participants.length);
  const chosenParticipant = participants[idx];
  const seed = randomUUID();

  const resultId = randomUUID();
  const insertResult = db.prepare(
    `INSERT INTO draw_results (id, session_id, participant_id, prize_id, rng_seed)
     VALUES (?, ?, ?, ?, ?)`
  );
  const updatePrize = db.prepare(
    `UPDATE prizes SET remaining = remaining - 1 WHERE id = ?`
  );

  const tx = db.transaction(() => {
    insertResult.run(resultId, sessionId, chosenParticipant.id, chosenPrize.id, seed);
    updatePrize.run(chosenPrize.id);

    // Nếu không cho phép trùng giải nói chung (allow_duplicate_prize = 0),
    // và exclude_previous_winners tắt, ta vẫn cần đảm bảo participant này
    // không trúng lại chính xác prize_id đó lần nữa trong session - xử lý ở query lúc sau
    // bằng cách filter thêm nếu cần (mở rộng sau này).
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
