// Nén bản thư mục (portable) thành "<productName>-<version>-<win|mac>.zip" có SẴN 1 thư mục mẹ
// "Lucky Draw Studio" bên trong — giải nén ra đúng 1 thư mục thay vì bung file lẻ ra chỗ đang đứng.
// Chạy sau electron-builder trong "npm run package", trên đúng hệ điều hành đang build:
//   - Windows: nén release/win-unpacked bằng tar.exe (bsdtar) có sẵn trong Windows 10/11, rồi giải nén
//              sẵn zip đó ra release/<productName>-<version>-win/ (bản portable dùng ngay không cần unzip).
//   - macOS:   ký ad-hoc "Lucky Draw Studio.app" (codesign) rồi nén release/mac-universal bằng ditto
//              (giữ đúng symlink/metadata của .app bundle — zip thường làm hỏng bundle).
// Không thêm dependency. Zip luôn có thư mục data\ RỖNG — dữ liệu lúc chạy thử bản build không được lọt
// vào bản phân phối. Xem docs/deploy/portable.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
// đúng tên cũ ở lần build sau). `data/` (nếu có) được tạm dời ra ngoài, thay bằng 1 `data/` rỗng
// trong lúc nén.
function zipWithRootFolder(srcDirName, zipName, compress) {
  const srcDir = join(releaseDir, srcDirName);
  const stagedDir = join(releaseDir, productName);
  const dataDir = join(srcDir, "data");
  const dataAside = join(releaseDir, `.data-aside-${process.pid}`);
  if (existsSync(stagedDir)) fail(`${stagedDir} đang tồn tại — xoá/đổi tên thư mục đó rồi chạy lại`);

  rmSync(join(releaseDir, zipName), { force: true });
  const hasData = existsSync(dataDir);
  if (hasData) renameSync(dataDir, dataAside);
  // Zip luôn có sẵn data/ RỖNG — người nhận thấy ngay chỗ để/copy file session, khỏi chờ app tạo.
  mkdirSync(dataDir);
  renameSync(srcDir, stagedDir);
  try {
    compress(productName, zipName);
  } finally {
    renameSync(stagedDir, srcDir);
    rmSync(dataDir, { recursive: true, force: true });
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

  // Giải nén sẵn chính file zip vừa tạo ra release/<productName>-<version>-win/ — để release/ luôn có đủ
  // 3 lựa chọn: Setup.exe, .zip, hoặc thư mục đã giải nén copy/chạy thẳng. Giải nén TỪ zip (không copy
  // win-unpacked) để nội dung giống hệt người nhận zip, đồng thời kiểm tra luôn zip không hỏng.
  const zipName = `${productName}-${pkg.version}-win.zip`;
  const unzippedDir = join(releaseDir, `${productName}-${pkg.version}-win`);
  const unzipTmp = join(releaseDir, `.unzip-${process.pid}`);
  rmSync(unzippedDir, { recursive: true, force: true });
  rmSync(unzipTmp, { recursive: true, force: true });
  mkdirSync(unzipTmp);
  try {
    run(tar, ["-x", "-f", zipName, "-C", unzipTmp]);
    renameSync(join(unzipTmp, productName), unzippedDir);
  } finally {
    rmSync(unzipTmp, { recursive: true, force: true });
  }
  console.log(`make-portable-zip: ${unzippedDir}`);
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

// README.txt hướng dẫn nhanh cho người nhận file — nguồn ở assets/distribution/README.txt (release/ bị xoá
// và sinh lại mỗi lần build nên không sửa tay ở đó). Điền version, CRLF + BOM để Notepad mọi bản
// Windows hiện đúng tiếng Việt.
const readmeSrc = join(root, "assets", "distribution", "README.txt");
if (existsSync(readmeSrc)) {
  const text = readFileSync(readmeSrc, "utf8").replace(/\{\{version\}\}/g, pkg.version).replace(/\r?\n/g, "\r\n");
  writeFileSync(join(releaseDir, "README.txt"), "﻿" + text, "utf8");
  console.log(`make-portable-zip: ${join(releaseDir, "README.txt")}`);
}
