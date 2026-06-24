import crypto from "crypto";

/**
 * 1. LOGIC
 */

  /**
   * 1.1. Normalize name
   */
function normalizeName(name) {

  if (!name) return "";

  return String(name)

    .trim()

    .toLowerCase()

    .split(/\s+/)

    .map(word =>

      word.charAt(0).toUpperCase() +
      word.slice(1)

    )

    .join(" ");

}

  /**
   * 1.2. Normalize phone
   */
function normalizePhone(phone) {

  if (!phone) return "";

  let cleaned =

    String(phone)

      .replace(/\s+/g, "")

      .replace(/[^\d+]/g, "");

  if (
    cleaned.startsWith("+84")
  ) {

    cleaned =
      "0" + cleaned.slice(3);

  }

  else if (
    cleaned.startsWith("84")
  ) {

    cleaned =
      "0" + cleaned.slice(2);

  }

  else if (

    cleaned.length === 9 &&
    !cleaned.startsWith("0")

  ) {

    cleaned =
      "0" + cleaned;

  }

  return cleaned;

}

/**
 * 1.3. Generate last 3 digits of phone
 */
function generateLast3(phone) {

  if (!phone) return "";

  return phone.slice(-3);

}

/**
  * 1.4. Generate masked phone
 */
function generateMaskedPhone(phone) {

  if (!phone) return "";

  if (phone.length < 7) {

    return phone;

  }

  const first4 =
    phone.slice(0, 4);

  const last3 =
    phone.slice(-3);

  return `${first4}xxx${last3}`;

}

/**
 * 1.5. Generate customerId via UUID v4
 */
function generateCustomerId() {

  return crypto.randomUUID();

}


/**
 * 2. PUBLIC
 *
 * BƯỚC 1
 * Chuẩn hóa từng record
 *
 * - Sinh customerId nếu chưa có
 * - Chuẩn hóa tên
 * - Chuẩn hóa số điện thoại
 *
 *
 * BƯỚC 2
 * Loại bỏ record không hợp lệ
 *
 * - Không có số điện thoại
 * - Trùng số điện thoại
 *
 *
 * KẾT QUẢ
 *
 * Trả về dataset sạch để sử dụng cho:
 *
 * - Randomizer
 * - Lucky Draw
 * - Export Winner
 * - Reporting
 *
 */
export function cleanParticipants(records = []) {

  /**
   * 2.1. Validate duplicate phone
   */
  const phoneSet =
    new Set();

  return records

    /// Clean each record and keep all original fields
    .map(record => ({

      ...record,

      /**
       * Nếu dataset chưa có customerId
       * thì hệ thống tự sinh UUID.
       *
       * Nếu đã có customerId
       * thì giữ nguyên.
       */
      customerId:

        record.customerId ||

        generateCustomerId(),

      /**
       * Chuẩn hóa tên.
       *
       * Ví dụ:
       *
       * "   NGUYEN   VAN a "
       *
       * =>
       *
       * "Nguyen Van A"
       *
       */
      fullName:

        normalizeName(
          record.fullName
        ),

      /**
       * Chuẩn hóa số điện thoại.
       *
       * Ví dụ:
       *
       * +84901234567
       *
       * =>
       *
       * 0901234567
       *
       */
      phone:

        normalizePhone(
          record.phone
        )

    }))

    /**
     * =================================================
     * BƯỚC 2
     * LOẠI BỎ RECORD KHÔNG HỢP LỆ
     * =================================================
     *
     * filter() quyết định record nào được giữ lại.
     *
     * return true
     * => giữ lại
     *
     * return false
     * => loại bỏ
     *
     */
    .filter(record => {

      /**
       * -----------------------------------------------
       * Rule 1
       *
       * Không có phone
       * => loại
       * -----------------------------------------------
       */
      if (!record.phone) {

        return false;

      }

      /**
       * -----------------------------------------------
       * Rule 2
       *
       * Phone đã xuất hiện
       * => loại bản ghi trùng
       * -----------------------------------------------
       *
       * Ví dụ:
       *
       * Record 1
       * 0901234567
       *
       * Record 2
       * 0901234567
       *
       * Record 2 sẽ bị loại.
       *
       */
      if (

        phoneSet.has(
          record.phone
        )

      ) {

        return false;

      }

      /**
       * -----------------------------------------------
       * Record hợp lệ
       *
       * Đánh dấu phone đã xuất hiện.
       * -----------------------------------------------
       */
      phoneSet.add(
        record.phone
      );

      /**
       * Giữ lại record.
       */
      return true;

    });

}