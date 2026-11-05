---
name: led-frame
description: Tạo khung LED Frame (PNG nét đứt + pixel map cho component Frame) để khoanh vùng các màn LED trên Landing canvas 1920×1080, từ bản vẽ/phối cảnh sân khấu hoặc kích thước LED. Dùng khi người dùng gửi ảnh LED map/sân khấu, nhắc "Frame", "khung LED", "pixel map", "LED cánh", "khoanh vùng hiển thị".
---

# Vẽ LED Frame cho Landing canvas

Mục đích: Background trải trên toàn canvas, nhưng chỉ phần nằm trên các màn LED THẬT mới hiện ra sân khấu.
Khung giúp người dựng Landing đặt nội dung đúng vào vùng từng màn, và giúp căn vùng cắt trong Resolume.
Tính năng app liên quan: component **Frame** (`outputFrame`) — đọc `docs/landing/output-frame.md`.
Không còn giới hạn số Frame/trang — nhiều màn tách rời (vd 3 cánh LED) dùng NHIỀU Frame riêng (mỗi cái 1
khung chữ nhật đơn giản, dùng file `_dashed-frame_` chỉ để lên hình tham khảo vị trí, KHÔNG import file
đó làm Shape Image — xem "Không làm" cuối file). Chỉ dùng Shape **Image** + file `_pixelmap_` khi 1 màn
tự nó có hình dạng phức tạp (tròn, vành khuyên, cánh cong) không vẽ được bằng khung chữ nhật. Không có
tính năng "Dim outside" (đã thử rồi bỏ — quá phức tạp so với nhu cầu thực tế, xem CHANGELOG.md) — phần
canvas ngoài vùng LED mặc định không tự tối, muốn tối thì tự đặt 1 lớp Background/Image màu đen phủ lên.

## Hiểu đúng yêu cầu trước khi vẽ

- Người dùng thường gửi 2 ảnh: (1) ảnh mẫu canvas có khung khoanh vùng mong muốn, (2) **bản vẽ phối
  cảnh sân khấu / LED map** — **tỷ lệ LẤY TỪ ảnh (2)**, ảnh (1) chỉ để hiểu cách trình bày.
- "LED chính" = các màn sẽ nhận Background chung (thường nhóm giữa sân khấu: 2 màn dọc + 1 màn giữa).
  Màn 16:9 riêng lẻ hai bên rìa (cánh ngoài, chiếu nội dung khác) KHÔNG nằm trong khung trừ khi được nói rõ.
- **Giữ khe hở thật giữa các màn** trong khung — để Background trải liền mạch như mắt khán giả nhìn
  thấy trên sân khấu (phần rơi vào khe đơn giản là không hiện).
- Có thông số thật từ bên LED (mét, số cabinet, hoặc pixel từng màn) → dùng thẳng, bỏ qua bước đo ảnh.

## Bước 1 — Đo bản vẽ bằng pixel (khi chỉ có ảnh)

Không đoán bằng mắt. Ảnh người dùng dán vào nằm ở thư mục `images/` trong scratchpad. Trên Windows, đọc
pixel bằng PowerShell `System.Drawing` (không cần cài gì; máy dev KHÔNG có Python PIL):

```powershell
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("<đường dẫn ảnh>")
# Màn LED = pixel bão hoà màu (max-min kênh > 60); tường/khung truss trong bản vẽ = xám (~149,149,149).
function Sat($x,$y){ $c=$bmp.GetPixel($x,$y); ([Math]::Max($c.R,[Math]::Max($c.G,$c.B)) - [Math]::Min($c.R,[Math]::Min($c.G,$c.B))) -gt 60 }
# Quét 1 hàng ngang → các đoạn liên tục = mép trái/phải từng màn; quét cột dọc → mép trên/dưới.
```

Lưu ý khi đo:
- Quét **nhiều hàng/cột** — chữ trắng/logo trong nội dung màn làm đứt đoạn quét; lấy mép ngoài cùng.
- Mép dưới hay bị đèn moving head / sàn sân khấu che → in RGB từng pixel quanh mép để phân biệt LED
  (xanh/tím bão hoà) với tường (xám) ở **khe giữa 2 màn** — khe xám tới đâu thì mép màn tới đó.
- Quy ra đơn vị thật: lấy chiều cao màn cao nhất làm thước, làm tròn về số đẹp (LED lắp bằng cabinet
  0.5m) — vd đo được 158×418.5 / 310×367.5 / khe 28 px → 3×8m / 6×7m / khe 0.5m. Nói rõ với người
  dùng đây là ƯỚC LƯỢNG từ phối cảnh, xin thông số thật nếu có.

## Bước 2 — Viết spec + chạy script

Script dùng chung: `.claude/skills/led-frame/make_led_frame.cjs` (không dependency). Viết spec JSON vào
scratchpad (toạ độ gốc trên-trái của cả cụm, cùng 1 đơn vị):

```json
{
  "name": "LED-3-main",
  "unit": "m",
  "screens": [
    { "name": "Left",   "x": 0,    "y": 0, "w": 3, "h": 8 },
    { "name": "Center", "x": 3.5,  "y": 1, "w": 6, "h": 7 },
    { "name": "Right",  "x": 10,   "y": 0, "w": 3, "h": 8 }
  ]
}
```

```bash
node .claude/skills/led-frame/make_led_frame.cjs <spec.json> "C:/Users/ADMIN/Documents/LED-pixel-maps"
```

Output (thư mục `Documents\LED-pixel-maps\` ngoài repo — không commit file ảnh vào git):
1. `<name>_dashed-frame_1920x1080.png` — khung **nét đứt** vàng #FFCA2D, nền trong suốt, cả cụm fit vừa
   canvas + canh giữa. Đây là thứ người dùng thường muốn (giống ảnh mẫu).
2. `<name>_pixelmap_WxH.png` — nền đen + vùng LED màu, cho Frame Shape **Image** (viền **nét liền**,
   bật/tắt bằng Show in Presentation).

Script in toạ độ X/Y/W/H từng màn trên canvas — đưa vào câu trả lời (bảng) để người dùng đặt nội dung /
nhập Resolume. Luôn `Read` file PNG nét đứt để tự kiểm tra trước khi báo xong.

## Bước 3 — Hướng dẫn người dùng dùng trong app

- **Nét đứt**: Landing Builder → component **Image** → chọn file → X=0, Y=0, W=1920, H=1080, đặt trên
  cùng. Nhắc **ẩn/xoá trước khi diễn** (Image hiện cả ở Present Mode). File này CHỈ để tham khảo vị trí
  khi dựng Landing — KHÔNG BAO GIỜ import vào Frame (xem "Không làm").
- **Từng màn là chữ nhật thuần** (trường hợp phổ biến nhất — các `screens` trong spec vốn là hình chữ
  nhật): KHÔNG cần pixel map/Shape Image gì cả. Mỗi màn → 1 component **Frame** riêng, Shape
  **Rectangle**, nhập đúng toạ độ X/Y/W/H script đã in ra (hoặc Fit to canvas nếu chỉ có 1 màn). Đơn
  giản hơn, không cần import ảnh.
- **Chỉ dùng Pixel map khi 1 màn THẬT SỰ không phải chữ nhật** (tròn, vành khuyên, cánh cong, hoặc 1
  cụm nhiều mảnh rời cần gộp vào ĐÚNG 1 Frame): component **Frame** → Shape **Image (LED mapping PNG)**
  → chọn đúng file `_pixelmap_` (KHÔNG phải file `_dashed-frame_`) → tự Fit to canvas. Tắt **Show in
  Presentation** trước khi diễn nếu chỉ dùng để căn chỉnh.

## Không làm

- Không sửa code app chỉ để vẽ khung — 2 file PNG ở trên đủ dùng với tính năng hiện có.
- Không xếp các màn sát nhau khi bản vẽ có khe; không gộp màn cánh ngoài vào nếu không được yêu cầu.
- **KHÔNG BAO GIỜ import file `_dashed-frame_` vào Frame Shape Image** (dù của 1 cụm hay cắt riêng từng
  màn) — file đó nền trong suốt ~99%, chỉ có đường viền là đặc; dùng làm mask sẽ khiến app nhận diện
  "LED area" gần như 0% (panel hiện cảnh báo "Almost no LED area detected"), viền vẽ ra sai be bét so
  với vùng LED thật (bug đã xảy ra thật). Dùng đúng file `_pixelmap_` cho Shape Image, hoặc đơn giản
  hơn là Shape Rectangle nếu màn vốn là hình chữ nhật.
- Canvas cố định 1920×1080 (plan canvas tuỳ chỉnh đang hoãn, xem CLAUDE.md) — khi tỷ lệ cụm LED quá dẹt
  (vd > 3:1) thì báo người dùng phần dùng được của canvas nhỏ, ảnh nền sẽ bị phóng to trên LED.
