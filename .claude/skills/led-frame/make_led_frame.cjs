// Tạo khung LED cho Landing canvas từ 1 file spec JSON — xem SKILL.md cùng thư mục.
// Chạy: node make_led_frame.cjs <spec.json> <thư mục output>
// Không dùng thư viện ngoài (tự ghi PNG bằng zlib), chạy được trên mọi máy có Node.
//
// spec.json:
// {
//   "name": "LED-3-main",              // tiền tố tên file
//   "unit": "m",                       // chỉ để in log (m / px / cabinet...)
//   "screens": [                       // toạ độ trong CÙNG 1 hệ đơn vị, gốc trên-trái của cả cụm
//     { "name": "Left",   "x": 0,   "y": 0, "w": 3, "h": 8 },
//     { "name": "Center", "x": 3.5, "y": 1, "w": 6, "h": 7 },
//     { "name": "Right",  "x": 10,  "y": 0, "w": 3, "h": 8 }
//   ],
//   "pixelMapLongEdge": 3328,          // tuỳ chọn — cạnh dài pixel map (mặc định 3328)
//   "canvas": { "width": 1920, "height": 1080 }  // tuỳ chọn — mặc định 1920×1080
// }
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const [specFile, outDir] = process.argv.slice(2);
if (!specFile || !outDir) {
  console.error("Usage: node make_led_frame.cjs <spec.json> <outDir>");
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const screens = spec.screens;
const name = spec.name || "LED-frame";
const unit = spec.unit || "";
const canvasW = spec.canvas?.width ?? 1920;
const canvasH = spec.canvas?.height ?? 1080;

// Chuẩn hoá về gốc (0,0) của bounding box cả cụm — spec có thể nhập toạ độ lệch.
const minX = Math.min(...screens.map((s) => s.x));
const minY = Math.min(...screens.map((s) => s.y));
const totalW = Math.max(...screens.map((s) => s.x + s.w)) - minX;
const totalH = Math.max(...screens.map((s) => s.y + s.h)) - minY;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function writePng(file, W, H, rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(rgba.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}
function fillRect(buf, W, H, x0, y0, w, h, c) {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) buf.set(c, (y * W + x) * 4);
}

fs.mkdirSync(outDir, { recursive: true });

// (1) Pixel map cho Frame shape "Image": nền đen đục, vùng LED màu sáng (detect "auto" → theo độ sáng).
{
  const ppu = (spec.pixelMapLongEdge ?? 3328) / Math.max(totalW, totalH);
  const W = Math.round(totalW * ppu);
  const H = Math.round(totalH * ppu);
  const buf = new Uint8Array(W * H * 4);
  fillRect(buf, W, H, 0, 0, W, H, [0, 0, 0, 255]);
  const colors = [[32, 199, 241, 255], [255, 202, 45, 255]];
  screens.forEach((s, i) => {
    const x0 = Math.round((s.x - minX) * ppu);
    const y0 = Math.round((s.y - minY) * ppu);
    fillRect(buf, W, H, x0, y0, Math.round((s.x - minX + s.w) * ppu) - x0, Math.round((s.y - minY + s.h) * ppu) - y0, colors[i % 2]);
  });
  const file = path.join(outDir, `${name}_pixelmap_${W}x${H}.png`);
  writePng(file, W, H, buf);
  console.log(`pixel map ${W}x${H} -> ${file}`);
}

// (2) Khung nét đứt vàng #FFCA2D, nền trong suốt, đúng kích thước canvas — cả cụm fit vừa canvas, canh
// giữa. Nét 3px nằm TRONG mép từng màn (giống Frame), dash 16 / space 10.
{
  const W = canvasW, H = canvasH;
  const scale = Math.min(W / totalW, H / totalH);
  const offX = (W - totalW * scale) / 2;
  const offY = (H - totalH * scale) / 2;
  const buf = new Uint8Array(W * H * 4);
  const GOLD = [255, 202, 45, 255];
  const T = 3, DASH = 16, SPACE = 10;
  const on = (i) => i % (DASH + SPACE) < DASH;
  console.log(`canvas ${W}x${H}: scale ${scale.toFixed(3)} px/${unit || "unit"}, offset x=${offX.toFixed(1)} y=${offY.toFixed(1)}`);
  for (const s of screens) {
    const x0 = Math.round(offX + (s.x - minX) * scale);
    const y0 = Math.round(offY + (s.y - minY) * scale);
    const x1 = Math.round(offX + (s.x - minX + s.w) * scale);
    const y1 = Math.round(offY + (s.y - minY + s.h) * scale);
    for (let x = x0; x < x1; x++) if (on(x - x0)) {
      fillRect(buf, W, H, x, y0, 1, T, GOLD);
      fillRect(buf, W, H, x, y1 - T, 1, T, GOLD);
    }
    for (let y = y0; y < y1; y++) if (on(y - y0)) {
      fillRect(buf, W, H, x0, y, T, 1, GOLD);
      fillRect(buf, W, H, x1 - T, y, T, 1, GOLD);
    }
    console.log(`${s.name}: x=${x0} y=${y0} w=${x1 - x0} h=${y1 - y0}  (${s.w}${unit} x ${s.h}${unit})`);
  }
  const file = path.join(outDir, `${name}_dashed-frame_${W}x${H}.png`);
  writePng(file, W, H, buf);
  console.log(`dashed frame -> ${file}`);
}
