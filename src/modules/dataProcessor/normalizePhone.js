export function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, "");

  // nếu bắt đầu bằng 84 -> chuyển thành 0
  if (digits.startsWith("84")) {
    digits = "0" + digits.slice(2);
  }

  return digits;
}