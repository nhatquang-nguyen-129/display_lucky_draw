// Resolver DÙNG CHUNG cho main process — tìm giá trị "Name"/"Phone"/"Code"/"Email" thật của 1
// participant KHÔNG dựa vào cột SQL cố định, mà dựa vào session.participant_column_types (cột nào
// đang được người dùng gán Data Type gì trong Data Editor). Đây là cơ chế THAY THẾ việc đọc cứng
// participant.name/.phone/... — Draw Engine/kết quả quay không cần biết "trường nào tên gì trong
// schema", chỉ cần biết cột nào đang được LABEL là Name/Phone/Code/Email (xem
// docs/participants/column-mapping.md và docs/architecture/draw-engine.md).
//
// Bản sao rút gọn của logic trong src/lib/dataEditor/validate.ts (isCoreFieldActive/resolveColumnForType)
// — không import trực tiếp được vì electron/ và src/ là 2 project TS biên dịch riêng (rootDir khác
// nhau, xem electron/tsconfig.json). Sửa 1 bên nhớ soi lại bên kia nếu đổi logic resolve.

export type ColumnType = "text" | "name" | "phone" | "email" | "code" | "url";

const CORE_FIELDS = ["name", "phone", "code", "email"] as const;
type CoreField = (typeof CORE_FIELDS)[number];

function defaultColumnType(col: string): ColumnType {
  if (col === "name") return "name";
  if (col === "phone") return "phone";
  if (col === "email") return "email";
  if (col === "code") return "code";
  return "text";
}

interface ParticipantLike {
  name: string;
  phone?: string | null;
  code?: string | null;
  email?: string | null;
  extra_data?: string | null;
}

function parseColumnTypes(json: string | null | undefined): Record<string, ColumnType> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, ColumnType>;
  } catch {
    return {};
  }
}

function parseExtra(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Đọc giá trị 1 core field trên participant theo tên field (an toàn kiểu, tránh index string thô). */
function coreFieldValue(p: ParticipantLike, col: CoreField): string {
  const v = col === "name" ? p.name : p[col];
  return typeof v === "string" ? v : "";
}

/**
 * Resolve giá trị hiển thị của 1 ColumnType (vd "name") cho 1 participant — ưu tiên core field nếu
 * NÓ đang thực sự có type đó (mặc định hoặc override) VÀ đang có dữ liệu thật ở participant này hoặc
 * nơi khác trong session (activeInSession); nếu không, tìm cột phụ (extra_data) đầu tiên được gán
 * TAY đúng type đó. `activeInSession` do caller tự tính 1 lần cho cả session (participants:list),
 * tránh phải truyền cả mảng participants vào mỗi lần resolve 1 người.
 */
export function resolveParticipantField(
  p: ParticipantLike,
  columnTypesJson: string | null | undefined,
  type: ColumnType,
  activeCoreFields: ReadonlySet<CoreField>
): string {
  const columnTypes = parseColumnTypes(columnTypesJson);
  for (const col of CORE_FIELDS) {
    if (!activeCoreFields.has(col)) continue;
    if ((columnTypes[col] ?? defaultColumnType(col)) === type) return coreFieldValue(p, col);
  }
  const extra = parseExtra(p.extra_data);
  for (const [col, t] of Object.entries(columnTypes)) {
    if (t === type && !(CORE_FIELDS as readonly string[]).includes(col) && typeof extra[col] === "string") {
      return extra[col];
    }
  }
  // Chưa ai gán nhãn nào cho type này — fallback về core field cùng tên (dữ liệu cũ trước khi đổi
  // thiết kế import, hoặc participant tạo/sửa thủ công vẫn dùng thẳng core field như trước).
  if (type === "name" || type === "phone" || type === "code" || type === "email") {
    return coreFieldValue(p, type);
  }
  return "";
}

/** Core field nào trong TOÀN BỘ session đang có dữ liệu thật ở ít nhất 1 participant — tính 1 lần,
 * dùng lại cho mọi lần resolve trong cùng 1 lượt query (xem sessions:results/pickWinner trong main.ts). */
export function computeActiveCoreFields(participants: ParticipantLike[]): Set<CoreField> {
  const active = new Set<CoreField>();
  for (const col of CORE_FIELDS) {
    if (participants.some((p) => coreFieldValue(p, col).trim())) active.add(col);
  }
  return active;
}
