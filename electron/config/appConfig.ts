/**
 * Cấu hình branding + môi trường tập trung — MỌI nơi trong app (main.ts, present window,
 * sau này nếu có thêm module) đều lấy tên app / nhãn môi trường từ đây, không hardcode rải rác.
 *
 * Thêm môi trường mới (vd "uat", "stg"): chỉ cần thêm 1 dòng vào ENV_LABELS bên dưới,
 * không phải sửa main.ts hay bất kỳ file nào khác.
 */

export type AppEnv = "development" | "local" | "user_acceptance_testing" | "staging" | "production";

export const APP_NAME = "Lucky Draw Studio";

// Nhãn hiển thị trước tên app theo từng môi trường. Môi trường không có trong danh sách
// này (vd "production") sẽ không có tiền tố — hiển thị đúng tên app thuần.
const ENV_LABELS: Partial<Record<AppEnv, string>> = {
  development: "dev",
  local: "local",
  user_acceptance_testing: "uat",
  staging: "stg",
};

const KNOWN_ENVS: AppEnv[] = [
  "development",
  "local", 
  "user_acceptance_testing", 
  "staging", 
  "production"
];

function normalizeEnv(raw: string | undefined): AppEnv {
  return KNOWN_ENVS.includes(raw as AppEnv) ? (raw as AppEnv) : "production";
}

// Ưu tiên APP_ENV nếu có set riêng (dùng cho local/uat/stg sau này qua script build khác nhau),
// fallback về NODE_ENV (hiện electron:dev đang set NODE_ENV=development).
export const APP_ENV: AppEnv = normalizeEnv(process.env.APP_ENV ?? process.env.NODE_ENV);

export const IS_DEV = APP_ENV === "development" || APP_ENV === "local";

/** Tiêu đề cửa sổ chính — vd "[dev] Lucky Draw Studio" hoặc "Lucky Draw Studio" ở production. */
export function getWindowTitle(): string {
  const label = ENV_LABELS[APP_ENV];
  return label ? `[${label}] ${APP_NAME}` : APP_NAME;
}
