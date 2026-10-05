# Frame (Output Frame)

Component nhóm **Basic**, tên hiển thị **Frame** (type key vẫn là `outputFrame` để tương thích landing đã lưu) — khung nét đứt vàng đánh dấu vùng LED controller/Resolume sẽ cắt ra khỏi
canvas 1920×1080, dùng khi màn LED thật không phải 16:9 (vd 3584×2304). THUẦN HIỂN THỊ: không đổi
kích thước canvas, không ảnh hưởng component nào khác. Liên quan: [`builder.md`](builder.md),
[`presentation.md`](presentation.md).

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
