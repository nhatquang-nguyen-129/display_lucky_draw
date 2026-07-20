import { Participant } from "@/types";
import { getParticipantField, ParticipantDisplayField } from "@/lib/landing/types";
import { maskPhone } from "@/lib/dataEditor/transforms";

// Dùng chung cho mọi template Lucky Wheel — "Mask sensitive data" ở v1 chỉ áp dụng cho field
// phone, tái dùng đúng maskPhone() đã có sẵn trong Data Editor (pattern "maskMost", giống mặc
// định của Display Phone generator) — không tạo quy tắc che dữ liệu mới cho các field khác.
export function displayValue(p: Participant, field: ParticipantDisplayField, mask: boolean): string {
  const raw = getParticipantField(p, field);
  if (mask && field === "phone" && raw) return maskPhone(raw, "maskMost");
  return raw || "—";
}
