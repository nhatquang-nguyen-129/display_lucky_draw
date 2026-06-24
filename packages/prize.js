import crypto from "crypto";

/**
 * PRIZE ENGINE (LOCAL MVP VERSION)
 *
 * Chức năng:
 * - Nhận dữ liệu giải thưởng dạng CSV/JSON (raw)
 * - Chuẩn hoá thành Prize Pool runtime
 * - Quản lý tồn kho giải thưởng
 * - Random giải theo weight
 * - Áp dụng rule trùng lặp
 * - Allocate / rollback
 * - Reporting
 *
 * Không phụ thuộc database
 * Dữ liệu mutate trực tiếp trong memory
 *
 */


/**
 * 1. CONVERT `RAW PRIZE DATA` -> `PRIZE POOL`
 */
export function buildPrizePool(rawPrizes = []) {

  return rawPrizes.map(prize => ({

    // Internal ID (unique)
    prizeId: prize.prizeId || crypto.randomUUID(),

    // Mã giải (unique business key)
    prizeCode: String(prize.prize_code || "").trim(),

    // Tên giải
    prizeName: String(prize.prize_name || "").trim(),

    // Phân loại giải (special/first/second...)
    prizeCategory: prize.prize_category || "default",

    // Tổng số lượng giải
    quantity: Number(prize.quantity || 0),

    // Số lượng còn lại
    remainingQuantity: Number(prize.quantity || 0),

    // Số lượng đã phân bổ
    allocatedQuantity: 0,

    // Trọng số random
    weight: Number(prize.weight || 1),

    // Rule: có được trùng với giải khác không
    allowDuplicateWithOtherPrizes:
      Boolean(prize.allow_duplicate_with_other_prizes),

    // Rule: có được trúng cùng giải nhiều lần không
    allowDuplicateSamePrize:
      Boolean(prize.allow_duplicate_same_prize),

    // Giới hạn số lần 1 user được trúng giải này
    maxWinCount: Number(prize.max_win_count || 1),

    // Ảnh giải thưởng
    imageUrl: prize.image_url || "",

    // trạng thái active/inactive
    active: prize.active !== false

  }));

}

/**
 * 2. VALIDATE PRIZE POOL
 */
export function validatePrizePool(prizePool = []) {

  const errors = [];
  const codeSet = new Set();

  for (const prize of prizePool) {

    if (!prize.prizeCode) {
      errors.push("Missing prizeCode");
    }

    if (!prize.prizeName) {
      errors.push(`Missing prizeName: ${prize.prizeCode}`);
    }

    if (codeSet.has(prize.prizeCode)) {
      errors.push(`Duplicate prizeCode: ${prize.prizeCode}`);
    }

    codeSet.add(prize.prizeCode);

    if (prize.quantity < 0) {
      errors.push(`Invalid quantity: ${prize.prizeCode}`);
    }

    if (prize.weight < 0) {
      errors.push(`Invalid weight: ${prize.prizeCode}`);
    }

  }

  return {
    valid: errors.length === 0,
    errors
  };

}


/**
 * 3. GET AVAILABLE PRIZES
 */
export function getAvailablePrizes(prizePool = []) {

  return prizePool.filter(prize =>
    prize.active &&
    prize.remainingQuantity > 0
  );

}


/**
 * 4. CHECK PRIZE AVAILABLE
 */
export function isPrizeAvailable(prizePool, prizeCode) {

  const prize = prizePool.find(
    p => p.prizeCode === prizeCode
  );

  if (!prize) return false;

  return prize.active && prize.remainingQuantity > 0;

}


/**
 * 5. WEIGHTED PRIZE PICKER
 */
export function pickPrize(prizePool = []) {

  const available = getAvailablePrizes(prizePool);

  if (!available.length) return null;

  const totalWeight = available.reduce(
    (sum, p) => sum + p.weight,
    0
  );

  if (totalWeight <= 0) return null;

  const random = Math.random() * totalWeight;

  let cumulative = 0;

  for (const prize of available) {

    cumulative += prize.weight;

    if (random <= cumulative) {
      return prize;
    }

  }

  return available[available.length - 1];

}


/**
 * =====================================================
 * 6. DUPLICATE RULE CHECK
 * =====================================================
 */
export function canReceivePrize({
  customerId,
  prize,
  history = []
}) {

  const userHistory =
    history.filter(h => h.customerId === customerId);

  // Rule: không được trúng nhiều loại giải khác nhau
  if (
    !prize.allowDuplicateWithOtherPrizes &&
    userHistory.length > 0
  ) {
    return false;
  }

  // Rule: không được trúng cùng 1 loại giải nhiều lần
  const samePrizeCount =
    userHistory.filter(
      h => h.prizeCode === prize.prizeCode
    ).length;

  if (
    !prize.allowDuplicateSamePrize &&
    samePrizeCount > 0
  ) {
    return false;
  }

  // Rule: giới hạn số lần trúng cùng giải
  if (samePrizeCount >= prize.maxWinCount) {
    return false;
  }

  return true;

}


/**
 * =====================================================
 * 7. ALLOCATE PRIZE
 * =====================================================
 */
export function allocatePrize({
  prizePool,
  prizeCode,
  customerId,
  history = []
}) {

  const prize = prizePool.find(
    p => p.prizeCode === prizeCode
  );

  if (!prize) {
    throw new Error("Prize not found");
  }

  if (prize.remainingQuantity <= 0) {
    throw new Error("Prize exhausted");
  }

  // update inventory
  prize.remainingQuantity--;
  prize.allocatedQuantity++;

  // create allocation record
  const allocation = {
    allocationId: crypto.randomUUID(),
    customerId,
    prizeCode,
    prizeName: prize.prizeName,
    allocatedAt: new Date().toISOString()
  };

  history.push(allocation);

  return allocation;

}


/**
 * =====================================================
 * 8. RELEASE / ROLLBACK PRIZE
 * =====================================================
 */
export function releasePrize({
  prizePool,
  allocationId,
  history = []
}) {

  const index = history.findIndex(
    h => h.allocationId === allocationId
  );

  if (index === -1) return false;

  const record = history[index];

  const prize = prizePool.find(
    p => p.prizeCode === record.prizeCode
  );

  if (!prize) return false;

  // rollback inventory
  prize.remainingQuantity++;
  prize.allocatedQuantity--;

  history.splice(index, 1);

  return true;

}


/**
 * =====================================================
 * 9. POOL SUMMARY
 * =====================================================
 */
export function getPoolSummary(prizePool = []) {

  return prizePool.map(prize => ({

    prizeCode: prize.prizeCode,
    prizeName: prize.prizeName,

    total: prize.quantity,
    allocated: prize.allocatedQuantity,
    remaining: prize.remainingQuantity

  }));

}


/**
 * =====================================================
 * 10. POOL STATS
 * =====================================================
 */
export function getPoolStats(prizePool = []) {

  return {

    totalPrizes: prizePool.reduce(
      (s, p) => s + p.quantity,
      0
    ),

    allocatedPrizes: prizePool.reduce(
      (s, p) => s + p.allocatedQuantity,
      0
    ),

    remainingPrizes: prizePool.reduce(
      (s, p) => s + p.remainingQuantity,
      0
    )

  };

}