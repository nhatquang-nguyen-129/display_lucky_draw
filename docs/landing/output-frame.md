# Frame (Output Frame)

Component nhóm **Basic**, tên hiển thị **Frame** (type key vẫn là `outputFrame` để tương thích landing đã lưu) — khung nét đứt vàng đánh dấu vùng LED controller/Resolume sẽ cắt ra khỏi
canvas 1920×1080, dùng khi màn LED thật không phải 16:9 (vd 3584×2304). THUẦN HIỂN THỊ: không đổi
kích thước canvas, không ảnh hưởng component nào khác. Liên quan: [`builder.md`](builder.md),
[`presentation.md`](presentation.md).

2 dạng (`shape`): **Rectangle** (mặc định, khung chữ nhật theo độ phân giải nhập tay) và **Image** —
khung bám đúng hình vùng LED trong file pixel map PNG bên LED gửi (tròn, cong, cánh, nhiều mảnh rời),
xem mục [Shape Image](#shape-image--pixel-map-png).

## Dữ liệu (`OutputFrameProps`, `src/lib/landing/types.ts`)

- `targetWidth`/`targetHeight` — độ phân giải màn LED, CHỈ để lấy tỉ lệ + hiện nhãn.
- `showInPresent` — có vẽ khung lên Present Mode/preview cửa sổ chính không. Builder luôn vẽ.
- `x/y/width/height` của component CHÍNH LÀ vùng cắt (px canvas). `height` luôn dẫn xuất từ `width`
  (`computeOutputFrameHeight`), áp ở `fitAutoHeight` (`LandingBuilderWindow.tsx`, chung cơ chế với Digit
  Roller) — ô Height trong SharedFields bị khoá "(auto)".

## Hành vi

- Mặc định 3584×2304 → khung 1680×1080. Thả mới luôn nằm trên cùng (zIndex lớn nhất). Chỉ 1 cái/trang.
- Kéo góc: khoá tỉ lệ, góc đối diện đứng yên (`handleResizeMouseDown` trong `LandingCanvas.tsx`).
- **Bắt dính mép Background**: kéo di chuyển hoặc kéo góc lại gần (16px màn hình, `FRAME_SNAP_PX` — gấp
  đôi component thường) mép canvas hoặc mép ảnh Background THỰC TẾ đang hiển thị là tự khớp, hiện đường
  dóng đỏ. Vùng ảnh thật tính ở `visibleBackgroundRect()`: fit "cover"/"stretch" = khung component,
  "contain" = phần ảnh ở giữa (bỏ viền đen, cần kích thước gốc ảnh — tải nền qua `new Image()`), cắt theo
  canvas. Background đang ẩn trong Builder (`hiddenInBuilder`) không tính. Frame KHÔNG bắt dính vào các
  component khác (Text, Wheel...) — chỉ canvas + Background. Resize: chọn trục (mép ngang/dọc) lệch ít
  hơn để khớp, trục còn lại suy ra theo tỉ lệ.
- Ruột khung KHÔNG bắt chuột trong Builder (click xuyên xuống component bên dưới) — chỉ viền 4 cạnh +
  vùng nhãn góc trên-trái kéo/chọn được (tắt theo Hand tool/sửa anchor như mọi overlay khác).
- Panel (`OutputFramePanel.tsx`): toggle **Show in Presentation** ở đầu panel, ô LED width/height, nút
  **Fit to canvas** (khung lớn nhất vừa canvas, canh giữa), dòng toạ độ cắt X/Y/W/H để nhập vào Resolume.
- Nét đứt 1px MÀN HÌNH (SVG `vector-effect: non-scaling-stroke`, không phụ thuộc scale/zoom), nằm TRONG
  khung nên gọn trong vùng bị cắt. Nhãn toạ độ chỉ hiện trong Builder. Tắt toggle + Save → Present Mode tự
  ẩn khung sau ≤2s (poll config).

## Lưu ý khi cấu hình Resolume

Toạ độ là px canvas 1920×1080. Output trình chiếu khác 1920×1080 (vd 4K, hoặc có viền đen letterbox) thì
phải quy đổi theo tỉ lệ scale + offset viền — cách chắc nhất là bật khung trong Presentation và kéo vùng
cắt của Resolume khít theo nét vàng.

## Shape Image — pixel map PNG

Màn LED hình phức tạp (tròn, vành khuyên, cánh cong, nhiều màn rời) không vẽ tay được bằng khung chữ
nhật. Bên LED/mapping luôn có sẵn file **pixel map** (PNG đúng độ phân giải thật, đánh dấu chỗ nào có
LED) — Frame dùng thẳng file đó thay vì để người dùng tự vẽ lại (chọn import thay vì tự thiết kế: hình là
do bên LED quyết định, vẽ lại bằng tay chỉ thêm sai số).

**Cách dùng**: panel → Shape **Image (LED mapping PNG)** → chọn file. Độ phân giải LED lấy luôn từ kích
thước ảnh (không gõ tay, không thể sai tỉ lệ), khung tự **Fit to canvas**. Mọi hành vi kéo/resize giữ
tỉ lệ/bắt dính/toạ độ cắt giữ nguyên như Rectangle.

**Dữ liệu** (`OutputFrameProps`, mọi field mới đều OPTIONAL — landing cũ không có, đọc qua
`resolveFrameMaskOptions()` để lấy mặc định ở 1 chỗ):

| Field | Ý nghĩa | Mặc định |
|---|---|---|
| `shape` | `"rect"` / `"image"` | `"rect"` |
| `maskSrc`, `maskFileName` | Ảnh GỐC dạng data URL trong `landing_config` (như Image/Background) + tên file để hiện | — |
| `maskDetect` | `auto` / `alpha` (trong suốt = ngoài LED) / `luminance` (đen = ngoài LED) | `auto` |
| `maskInvert` | Đảo vùng LED/ngoài (file vẽ vùng LED màu tối) | `false` |
| `maskFillHoles` | Lấp lỗ kín bên trong vùng LED (số tấm, khe kín) — TẮT cho màn vành khuyên | `true` |
| `maskGapFill` | Lấp khe hở giữa các tấm LED, px theo ảnh gốc | `8` |
| `dimOutside`, `dimOpacity` | Làm tối phần canvas ngoài vùng LED (0-100) | `false`, `60` |
| `maskImageOpacity` | Hiện mờ ảnh pixel map gốc đè lên — CHỈ Builder, để đối chiếu nhận diện | `0` |

Giữ ảnh GỐC (không lưu ảnh đã xử lý) để đổi Detect/Invert/... không phải import lại. Chuyển về
Rectangle không xoá ảnh — chuyển lại Image là có lại ngay.

**Nhận diện vùng LED** (`src/lib/landing/frameMask.ts`, thuần Canvas 2D, không thư viện):

1. Thu ảnh về cạnh dài ≤ 2048px (đủ mịn cho canvas 1920, nhanh).
2. `auto`: > 0.5% pixel có độ trong suốt → theo alpha (≥ 128 = LED), ngược lại theo độ sáng (≥ 40/255 =
   LED — pixel map kiểu NovaStar/Colorlight: nền đen, tấm LED màu). Panel hiện cách đã dùng thật.
3. Lấp khe = phép đóng (giãn rồi co, ô vuông, tổng tiền tố 2 lượt ngang/dọc — O(số pixel)).
4. Lấp lỗ = loang từ mép ảnh qua vùng ngoài LED; vùng ngoài không thông ra mép = lỗ kín → thành LED.
5. Xuất 2 PNG: **viền** (dải vàng #FFCA2D ~3px canvas nằm TRONG mép vùng LED, mép ảnh tính là ngoài)
   và **outside** (đen đặc ở chỗ không có LED).

Kết quả cache theo (ảnh + tuỳ chọn), tối đa 6 mục, dùng chung trong cửa sổ (canvas Builder + panel).
Panel hiện **% diện tích LED**; < 1% hoặc > 99% → cảnh báo đổi Detect/Invert.

**Hiển thị** (`OutputFrameView.tsx`): viền là ảnh raster nên **nét liền**, không nét đứt như
Rectangle (nét đứt bám hình bất kỳ phải vector hoá ảnh — không đáng). Dim outside = ảnh outside trong
khung + 4 dải đen phủ phần canvas ngoài khung (giới hạn trong canvas, không tràn ra bàn nháp Builder),
chung 1 opacity; dải lấn vào khung 1px (`OVERLAP_PX`) để không lộ đường sáng mảnh ở mép do khử răng
cưa 2 lần — phần lấn nằm dưới viền vàng. Ảnh chưa xử lý xong/lỗi → tạm hiện khung chữ nhật nét đứt.
Show in Presentation tắt → ẩn cả viền lẫn dim ở Present Mode.
