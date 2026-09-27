// Nén release/win-unpacked thành "<productName>-<version>-win.zip" có SẴN 1 thư mục mẹ bên trong
// (giải nén ra luôn được "Lucky Draw Studio\..." thay vì bung ~18 file lẻ ra chỗ đang đứng).
// Target "zip" của electron-builder không có tuỳ chọn thư mục mẹ nên tự nén ở đây — chạy sau
// electron-builder trong "npm run package". Dùng tar.exe (bsdtar) có sẵn trong Windows 10/11, không
// thêm dependency. Bỏ qua win-unpacked\data\ — dữ liệu test lúc chạy thử win-unpacked không được lọt
// vào bản phân phối. Xem docs/deploy/portable-app.md.
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const productName = pkg.build.productName;
const releaseDir = join(root, pkg.build.directories.output);

if (process.platform !== "win32") {
  console.log("make-portable-zip: bỏ qua (chỉ build bản thư mục cho Windows)");
  process.exit(0);
}
if (!existsSync(join(releaseDir, "win-unpacked"))) {
  console.error(`make-portable-zip: không thấy ${join(releaseDir, "win-unpacked")} — chạy electron-builder trước`);
  process.exit(1);
}

const zipName = `${productName}-${pkg.version}-win.zip`;
const zipPath = join(releaseDir, zipName);
rmSync(zipPath, { force: true });

// tar.exe của Windows không có "-s" (đổi tên đường dẫn lúc nén) → tạm đổi tên win-unpacked thành
// thư mục mẹ mong muốn rồi nén, LUÔN đổi lại tên cũ kể cả khi nén lỗi (electron-builder cần đúng tên
// win-unpacked ở lần build sau).
const unpackedDir = join(releaseDir, "win-unpacked");
const stagedDir = join(releaseDir, productName);
if (existsSync(stagedDir)) {
  console.error(`make-portable-zip: ${stagedDir} đang tồn tại — xoá/đổi tên thư mục đó rồi chạy lại`);
  process.exit(1);
}

// Gọi đích danh System32\tar.exe — "tar" trong PATH của Git Bash là GNU tar, không nén được zip.
const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
renameSync(unpackedDir, stagedDir);
try {
  execFileSync(tar, ["-a", "-c", "-f", zipName, "--exclude", `${productName}/data`, productName], {
    cwd: releaseDir,
    stdio: "inherit",
  });
} finally {
  renameSync(stagedDir, unpackedDir);
}
console.log(`make-portable-zip: ${zipPath}`);
