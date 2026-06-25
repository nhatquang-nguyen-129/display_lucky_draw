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
 */
export function cleanParticipants(records = []) {

  /**
   * 2.1. Normalize each record
   */
  const phoneSet =
    new Set();

  return records

    /// Clean each record and keep all original fields
    .map(record => {

      const phone =
        normalizePhone(
          record.phone
        );

      return {

        ...record,

        customerId:

          record.customerId ||

          generateCustomerId(),

        fullName:

          normalizeName(
            record.fullName
          ),

        phone,

        /**
         * Hiển thị cho UI quay số
         *
         * Ví dụ:
         * 0901234567
         * =>
         * 567
         */
        displayLast3:

          generateLast3(
            phone
          ),

        /**
         * Hiển thị cho UI công khai
         *
         * Ví dụ:
         * 0901234567
         * =>
         * 0901xxx567
         */
        displayMaskedPhone:

          generateMaskedPhone(
            phone
          )

      };

    })

    /**
     * 2.2. Filter out invalid records
     */
    .filter(record => {

      /// Check if phone is missing
      if (!record.phone) {

        return false;

      }

      /// Check if phone is duplicate
      if (

        phoneSet.has(
          record.phone
        )

      ) {

        return false;

      }

      /// Mark phone as seen
      phoneSet.add(
        record.phone
      );

      /// Keep this record
      return true;

    });

}