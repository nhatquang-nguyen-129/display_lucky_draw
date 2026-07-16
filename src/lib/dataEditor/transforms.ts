export const trimSpace = (v: string) => v.trim().replace(/\s+/g, " ");
export const toUpperCase = (v: string) => v.toUpperCase();
export const toLowerCase = (v: string) => v.toLowerCase();
export const toTitleCase = (v: string) =>
  v.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

/** Chuẩn hoá số điện thoại VN về dạng 0xxxxxxxxx — xử lý +84/84 ở đầu, khoảng trắng, dấu gạch. */
export function normalizePhoneValue(v: string): string {
  let digits = v.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length > 9) digits = "0" + digits.slice(2);
  if (digits.length > 0 && !digits.startsWith("0")) digits = "0" + digits;
  return digits;
}

export const normalizeNameValue = (v: string) => toTitleCase(trimSpace(v));

export function isValidVietnamesePhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return /^0\d{9,10}$/.test(digits);
}

export type PhoneMaskPattern = "last3" | "maskLast3" | "maskMost";

/** vd 0912345783 -> last3: "783", maskLast3: "xxxxxxx783", maskMost: "0912xxx783" */
export function maskPhone(phone: string, pattern: PhoneMaskPattern): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (pattern === "last3") return digits.slice(-3);
  if (pattern === "maskLast3") return digits.length > 3 ? "x".repeat(digits.length - 3) + digits.slice(-3) : digits;
  if (digits.length <= 7) return digits;
  return digits.slice(0, 4) + "x".repeat(digits.length - 7) + digits.slice(-3);
}

export function findReplaceTransform(find: string, replace: string, caseSensitive: boolean) {
  return (value: string) => {
    if (!find) return value;
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return value.replace(new RegExp(escaped, caseSensitive ? "g" : "gi"), replace);
  };
}
