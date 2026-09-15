import { randomUUID, randomInt } from "crypto";
import { db } from "./db";
import { computeActiveCoreFields, resolveParticipantField } from "./participantFields";

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
    // confirmed = 1 — lượt Redo (chưa Confirm) không tính là "đã trúng", không được loại participant
    // khỏi vòng quay sau (xem migrateDrawResultsConfirmed trong db.ts).
    baseQuery += ` AND id NOT IN (SELECT participant_id FROM draw_results WHERE session_id = ? AND confirmed = 1)`;
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

  // Lịch sử trúng thưởng trong session — dùng để áp quy tắc trùng lặp cấp giải. Chỉ tính dòng
  // confirmed = 1 (đã Confirm thật), lượt Redo bỏ dở không tính vào bất kỳ giới hạn nào.
  const winRows = db
    .prepare(
      `SELECT participant_id, prize_id, COUNT(*) as cnt FROM draw_results WHERE session_id = ? AND confirmed = 1 GROUP BY participant_id, prize_id`
    )
    .all(sessionId) as { participant_id: string; prize_id: string; cnt: number }[];
  const winCountMap = new Map<string, number>();
  winRows.forEach((w) => winCountMap.set(`${w.participant_id}|${w.prize_id}`, w.cnt));

  const anyWinParticipants = new Set(
    (
      db
        .prepare(`SELECT DISTINCT participant_id FROM draw_results WHERE session_id = ? AND confirmed = 1`)
        .all(sessionId) as {
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

  // Tên hiển thị của người trúng KHÔNG đọc cứng participant.name — Draw Engine không cần biết cột
  // SQL nào tên gì, chỉ cần biết cột nào đang được Data Editor gán Data Type = "Name" (xem
  // docs/architecture/draw-engine.md, docs/participants/column-mapping.md). activeCoreFields tính
  // trên TOÀN BỘ participants của session (không chỉ nhóm đủ điều kiện) để khớp đúng những gì Data
  // Editor đang hiện cho người vận hành thấy.
  const allParticipants = db
    .prepare(`SELECT name, phone, code, email, extra_data FROM participants WHERE session_id = ?`)
    .all(sessionId) as { name: string; phone: string | null; code: string | null; email: string | null; extra_data: string | null }[];
  const activeCoreFields = computeActiveCoreFields(allParticipants);
  const participantName = resolveParticipantField(
    chosenParticipant,
    session.participant_column_types,
    "name",
    activeCoreFields
  );

  return {
    participantId: chosenParticipant.id,
    participantName: participantName || chosenParticipant.name,
    prizeId: chosenPrize.id,
    prizeName: chosenPrize.name,
    seed: randomUUID(),
  };
}

/** Ghi ngay 1 candidate VỪA pickWinner() vào DB ở trạng thái CHƯA xác nhận (confirmed = 0) — dùng cho
 * Button "Draw" trên Landing Page, ngay khi candidate hiện lên màn hình chờ Confirm/Redo. Mục đích
 * DUY NHẤT là để lại dấu vết cho Dashboard (xem docs/architecture/draw-engine.md): 1 candidate bị Redo
 * bỏ dở vẫn còn lịch sử "đã quay ra ai, lúc nào, cho giải gì, nhưng không Confirm". KHÔNG trừ
 * prizes.remaining (chỉ trừ lúc commitDraw) và KHÔNG tính vào bất kỳ quy tắc loại trừ nào trong
 * pickWinner() (mọi query ở đó đều lọc confirmed = 1). */
export function recordPendingDraw(candidate: DrawCandidate, sessionId: string): void {
  db.prepare(
    `INSERT INTO draw_results (id, session_id, participant_id, prize_id, rng_seed, confirmed) VALUES (?, ?, ?, ?, ?, 0)`
  ).run(randomUUID(), sessionId, candidate.participantId, candidate.prizeId, candidate.seed);
}

/** Ghi nhận chính thức 1 candidate đã pickWinner() — dùng cho Button "Confirm" trên Landing Page.
 * Thường chỉ cần UPDATE đúng dòng recordPendingDraw() đã ghi lúc pick() (khớp theo rng_seed, seed
 * random mỗi lần pick nên đủ để nhận diện đúng 1 lượt) lên confirmed = 1. Nếu không tìm thấy dòng nào
 * (đường đi cũ drawOne() — quay xong ăn ngay, không qua bước xem trước/recordPendingDraw) thì tự
 * insert thẳng 1 dòng confirmed = 1 — không bao giờ để mất 1 lượt đã Confirm thật. */
export function commitDraw(candidate: DrawCandidate, sessionId: string): void {
  const tx = db.transaction(() => {
    const updated = db
      .prepare(`UPDATE draw_results SET confirmed = 1 WHERE session_id = ? AND rng_seed = ? AND confirmed = 0`)
      .run(sessionId, candidate.seed);
    if (updated.changes === 0) {
      db.prepare(
        `INSERT INTO draw_results (id, session_id, participant_id, prize_id, rng_seed, confirmed) VALUES (?, ?, ?, ?, ?, 1)`
      ).run(randomUUID(), sessionId, candidate.participantId, candidate.prizeId, candidate.seed);
    }
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

/** Reset toàn bộ kết quả quay của 1 session — xoá hết draw_results (không đụng participants/prizes/
 * session như sessions:delete) và trả remaining của mọi prize về đúng quantity gốc, y hệt lúc chưa
 * quay lần nào. Dùng cho Button action "reset" trên Landing Page — không khôi phục được, phía
 * renderer phải tự hỏi xác nhận trước khi gọi (xem ButtonView.tsx). */
export function resetSession(sessionId: string): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM draw_results WHERE session_id = ?`).run(sessionId);
    db.prepare(`UPDATE prizes SET remaining = quantity WHERE session_id = ?`).run(sessionId);
  });
  tx();
}
