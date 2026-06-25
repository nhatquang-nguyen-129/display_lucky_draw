import crypto from "crypto";

/**
 * 1. LOGIC
 */

  /**
   * 1.1. Normalize string
   */
function normalizeString(value) {

  if (!value) return "";

  return String(value).trim();

}

  /**
   * 1.2. Normalize number
   */
function normalizeNumber(value) {

  const number =
    Number(value);

  return Number.isNaN(number)
    ? 0
    : number;

}

  /**
   * 1.3. Normalize boolean
   */
function normalizeBoolean(value) {

  if (
    value === true
  ) {

    return true;

  }

  const normalized =

    String(value)

      .trim()

      .toLowerCase();

  return [

    "true",
    "1",
    "yes",
    "y"

  ].includes(
    normalized
  );

}

  /**
   * 1.4. Generate prizeId
   */
function generatePrizeId() {

  return crypto.randomUUID();

}

/**
 * 2. PUBLIC 
 */
export function cleanPrizes(records = []) {

  /**
   * 2.1. Normalize each record
   */
  const prizeCodeSet =
    new Set();

  return records

    /// Clean each record and keep all original fields
    .map(record => ({

      ...record,

      /**
       * Internal ID
       */
      prizeId:

        record.prizeId ||

        generatePrizeId(),

      /**
       * Mã giải
       */
      prizeCode:

        normalizeString(
          record.prize_code
        ),

      /**
       * Tên giải
       */
      prizeName:

        normalizeString(
          record.prize_name
        ),

      /**
       * Tổng số lượng giải
       */
      quantity:

        normalizeNumber(
          record.quantity
        ),

      /**
       * Runtime State
       *
       * Số lượng còn lại.
       */
      remainingQuantity:

        normalizeNumber(
          record.quantity
        ),

      /**
       * Runtime State
       *
       * Số lượng đã trao.
       */
      allocatedQuantity:
        0,

      /**
       * Trọng số xuất hiện.
       *
       * Dùng cho các thuật toán
       * weighted random.
       */
      weight:

        normalizeNumber(
          record.weight
        ),

      /**
       * Có cho phép người chơi
       * trúng đồng thời giải khác hay không.
       */
      allowDuplicateWithOtherPrizes:

        normalizeBoolean(

          record.allow_duplicate_with_other_prizes

        ),

      /**
       * Có cho phép người chơi
       * nhận lại chính giải này hay không.
       */
      allowDuplicateSamePrize:

        normalizeBoolean(

          record.allow_duplicate_same_prize

        ),

      /**
       * Số lần tối đa
       * được nhận giải này.
       */
      maxWinCount:

        normalizeNumber(
          record.max_win_count
        ),

      /**
       * Hình ảnh giải thưởng.
       */
      imageUrl:

        normalizeString(
          record.image_url
        ),

      /**
       * Runtime State
       *
       * Danh sách winner
       * của giải này.
       */
      winners: []

    }))

    /**
     * -------------------------------------------------
     * 2.2. Loại bỏ dữ liệu lỗi
     * -------------------------------------------------
     */
    .filter(prize => {

      /**
       * Không có mã giải
       */
      if (!prize.prizeCode) {

        return false;

      }

      /**
       * Không có tên giải
       */
      if (!prize.prizeName) {

        return false;

      }

      /**
       * Không có số lượng
       */
      if (
        prize.quantity <= 0
      ) {

        return false;

      }

      /**
       * Mã giải bị trùng
       */
      if (

        prizeCodeSet.has(
          prize.prizeCode
        )

      ) {

        return false;


      }
      /**
       * Đánh dấu prizeCode
       * đã xuất hiện.
       */
      prizeCodeSet.add(
        prize.prizeCode
      );

      return true;

    });

}