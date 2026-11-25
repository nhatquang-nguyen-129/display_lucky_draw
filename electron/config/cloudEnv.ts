/**
 * Môi trường cloud (dev/prod) — PHẢI là import ĐẦU TIÊN của main.ts: db.ts/auth.ts tính đường dẫn
 * `userData` ngay lúc import, nên `setPath` ở đây phải chạy trước chúng.
 *
 * 2 môi trường tách biệt hoàn toàn (Worker + R2 bucket riêng, xem cloud/worker/wrangler.toml):
 * - Chạy chưa đóng gói (`npm run electron:dev`) → Worker `dev`, `userData` RIÊNG
 *   (`%APPDATA%\lucky-draw-app-dev` trên Windows) — không dùng chung phiên đăng nhập (auth-session.enc)
 *   lẫn `data/` với bản Setup cài trên cùng máy (trước đây dùng chung → bản Setup có thể tự đẩy dữ liệu
 *   thật lên Worker dev, hoặc bản dev "Import" chuyển mất session thật vào account dev).
 * - Bản đóng gói (`npm run package`) → Worker `prod`, `userData` mặc định như cũ.
 * Bản thư mục/portable vẫn để `data/` cạnh exe như cũ (xem db.ts) — chỉ phiên đăng nhập nằm ở userData.
 */
import path from "path";
import { app } from "electron";

export const CLOUD_ENV: "dev" | "prod" = app.isPackaged ? "prod" : "dev";

export const WORKER_URL =
  CLOUD_ENV === "dev" ? "https://dev.lucky-draw-studio.workers.dev" : "https://prod.lucky-draw-studio.workers.dev";

if (CLOUD_ENV === "dev") {
  app.setPath("userData", path.join(app.getPath("appData"), "lucky-draw-app-dev"));
}
