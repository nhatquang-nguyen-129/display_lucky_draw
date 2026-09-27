// Nén bản thư mục (portable) thành "<productName>-<version>-<win|mac>.zip" có SẴN 1 thư mục mẹ
// "Lucky Draw Studio" bên trong — giải nén ra đúng 1 thư mục thay vì bung file lẻ ra chỗ đang đứng.
// Chạy sau electron-builder trong "npm run package", trên đúng hệ điều hành đang build:
//   - Windows: nén release/win-unpacked bằng tar.exe (bsdtar) có sẵn trong Windows 10/11.
//   - macOS:   ký ad-hoc "Lucky Draw Studio.app" (codesign) rồi nén release/mac-universal bằng ditto
//              (giữ đúng symlink/metadata của .app bundle — zip thường làm hỏng bundle).
// Không thêm dependency. Bỏ qua thư mục data\ (dữ liệu lúc chạy thử bản build không được lọt vào bản
// phân phối). Xem docs/deploy/portable.md.
import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const productName = pkg.build.productName;
const releaseDir = join(root, pkg.build.directories.output);

function fail(message) {
  console.error(`make-portable-zip: ${message}`);
  process.exit(1);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: releaseDir, stdio: "inherit" });
}

// Nén `srcDirName` (thư mục con của release/) thành zip có thư mục mẹ tên productName: tạm đổi tên
// thư mục nguồn thành productName rồi nén, LUÔN đổi lại tên cũ kể cả khi lỗi (electron-builder cần
// đúng tên cũ ở lần build sau). `data/` (nếu có) được tạm dời ra ngoài trong lúc nén.
function zipWithRootFolder(srcDirName, zipName, compress) {
  const srcDir = join(releaseDir, srcDirName);
  const stagedDir = join(releaseDir, productName);
  const dataDir = join(srcDir, "data");
  const dataAside = join(releaseDir, `.data-aside-${process.pid}`);
  if (existsSync(stagedDir)) fail(`${stagedDir} đang tồn tại — xoá/đổi tên thư mục đó rồi chạy lại`);

  rmSync(join(releaseDir, zipName), { force: true });
  const hasData = existsSync(dataDir);
  if (hasData) renameSync(dataDir, dataAside);
  renameSync(srcDir, stagedDir);
  try {
    compress(productName, zipName);
  } finally {
    renameSync(stagedDir, srcDir);
    if (hasData) renameSync(dataAside, dataDir);
  }
  console.log(`make-portable-zip: ${join(releaseDir, zipName)}`);
}

if (process.platform === "win32") {
  if (!existsSync(join(releaseDir, "win-unpacked"))) fail("không thấy release/win-unpacked — chạy electron-builder trước");
  // Gọi đích danh System32\tar.exe — "tar" trong PATH của Git Bash là GNU tar, không nén được zip.
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  zipWithRootFolder("win-unpacked", `${productName}-${pkg.version}-win.zip`, (dir, zipName) =>
    run(tar, ["-a", "-c", "-f", zipName, dir])
  );
} else if (process.platform === "darwin") {
  // electron-builder đặt tên thư mục output theo arch: mac-universal / mac-arm64 / mac (x64).
  const srcDirName = ["mac-universal", "mac-arm64", "mac"].find((d) => existsSync(join(releaseDir, d, `${productName}.app`)));
  if (!srcDirName) fail(`không thấy release/mac-*/${productName}.app — chạy electron-builder trước`);

  const extra = readdirSync(join(releaseDir, srcDirName)).filter((f) => f !== `${productName}.app` && f !== "data");
  if (extra.length) console.warn(`make-portable-zip: ngoài .app còn có ${extra.join(", ")} — vẫn được nén cùng`);

  // Ký ad-hoc TOÀN BỘ bundle (không cần Apple Developer ID). Không ký/chữ ký hỏng → máy khác báo
  // "is damaged" không có nút mở; ký ad-hoc → chỉ báo "chưa xác minh" + có "Open Anyway".
  const appPath = join(releaseDir, srcDirName, `${productName}.app`);
  run("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  run("codesign", ["--verify", "--deep", "--strict", appPath]);

  zipWithRootFolder(srcDirName, `${productName}-${pkg.version}-mac.zip`, (dir, zipName) =>
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", dir, zipName])
  );
} else {
  console.log("make-portable-zip: bỏ qua (chỉ hỗ trợ Windows/macOS)");
}
