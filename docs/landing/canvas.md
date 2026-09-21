# Canvas mode & Toolbar

## Canvas mode

Artboard cố định **1920×1080** (`config.canvas.width/height`) — không đổi kích thước theo cửa sổ,
chỉ co giãn hiển thị (`scale = fitScale × zoom`, zoom 100%–400%). Đổi zoom qua `Ctrl/Cmd +/-`, nút
+/- ở góc dưới trái, hoặc cuộn chuột/pinch 2 ngón trực tiếp trên canvas — cả cuộn chuột (Windows/
macOS) lẫn pinch trackpad (macOS) đều nhận qua đúng 1 handler `wheel` gắn thủ công (không dùng prop
`onWheel` của React vì bị passive mặc định từ React 17, không preventDefault được) trong
`LandingCanvas.tsx`, xem comment tại đó. Giống hành vi trackpad gốc của macOS: pinch (2 ngón chụm/
xoè) LUÔN zoom bất kể tool nào đang bật; cuộn 2 ngón thường (không chụm) thì zoom nếu đang ở Select
tool, còn PAN nếu đang bật Hand tool — không cần giữ chuột kéo mới di chuyển được khung nhìn.

- **Chọn/kéo/resize**: mousedown-based (mousemove/mouseup gắn ở `window`, chia cho `scale` để ra
  đúng toạ độ artboard) — cùng kỹ thuật với việc kéo-resize cột trong Data Editor. Resize qua 4 tay
  cầm góc, kích thước tối thiểu 20px.
- **Bàn nháp (pasteboard) ngoài khung 1920×1080** — vùng chỉnh sửa THỰC TẾ rộng hơn hẳn khung hiển
  thị thật: mỗi bên (trái/phải/trên/dưới) có thêm 50% kích thước tương ứng của khung thật
  (`PASTEBOARD_MARGIN_RATIO` trong `LandingCanvas.tsx` — 960px hai bên trái/phải, 540px trên/dưới),
  tức tổng diện tích bàn nháp đúng bằng 1 khung 3840×2160 (4K) bao quanh khung thật nằm giữa —
  cho phép kéo/resize 1 component ra HẲN ngoài khung hiển thị thật. Đây là chỗ chuẩn bị sẵn cho hiệu
  ứng "xuất hiện từ ngoài khung vào trong" sau này (bản thân hiệu ứng animate chưa làm ở bản này) —
  nền bàn nháp tô màu khác (`bg-base-900`) + khung thật có viền đậm riêng (`outline-2 outline-base-400`)
  để phân biệt rõ ranh giới, không lẫn với viền `outline-gold-500` của component đang được chọn.
  Lưới căn chỉnh (xem bên dưới) cũng phủ đều lên cả bàn nháp, không riêng gì khung thật.
  **Vẫn thấy được nội dung thật của component khi đang đặt ở bàn nháp** — `LandingRenderer.tsx`
  nhận thêm prop `clip` (mặc định `true`, LUÔN `overflow-hidden` đúng khung width/height thật);
  CHỈ riêng lời gọi từ `LandingCanvas.tsx` truyền `clip={false}` để nội dung/màu sắc thật của 1
  component ở bàn nháp vẫn hiện ra trong lúc chỉnh sửa, thay vì bị cắt mất chỉ còn khung chọn rỗng.
  **An toàn tuyệt đối cho Present Mode**: `PresentMode.tsx` và `LandingPage.tsx` (preview read-only
  trong cửa sổ chính) đều KHÔNG truyền `clip` nên vẫn giữ nguyên `clip=true` mặc định — bàn nháp
  không bao giờ lọt vào buổi trình chiếu thật hay preview đó, chỉ là tiện ích riêng của MÀN HÌNH
  CHỈNH SỬA trong Builder. "Vừa khung" (100%, mức zoom out tối đa) giờ nghĩa là vừa CẢ bàn nháp
  (không chỉ riêng khung thật) — margin luôn hiện sẵn ngay từ đầu, không cần zoom out thêm mới thấy.
- **Thước (Rulers)**: vạch chia trải dài hết cả phần bàn nháp (âm ở đầu, vượt 1920/1080 ở cuối),
  không chỉ riêng khung thật — thấy được toạ độ của cả component đang đặt ngoài khung. Vẽ bởi
  `LandingRulers.tsx`, tham chiếu theo toạ độ artboard.
- **Smart guide bắt dính tâm canvas**: kéo di chuyển (không phải resize) — nếu tâm component đang
  kéo tới gần tâm ngang/dọc của khung THẬT (trong 8px màn hình, quy đổi theo `scale`), tự bắt dính
  đúng tâm và hiện đường guide đỏ, giống Figma/Photoshop — không đổi bởi bàn nháp, tâm luôn là tâm
  khung 1920×1080 thật.
- **Lưới (Grid)**: nút Gridline bật/tắt 1 lớp lưới 40px THUẦN HIỂN THỊ (không bắt dính toạ độ nào) —
  chỉ để căn mắt, phủ đều lên CẢ khung thật lẫn bàn nháp (lưới ở 2 vùng luôn khớp pha nhau, không bị
  lệch ở đường biên — `backgroundPosition` neo theo đúng gốc toạ độ khung thật).
- **Hand tool / pan**: kéo cả khung nhìn, kẹp biên để bàn nháp (khung thật + margin) không trôi mất
  khỏi màn hình; double-click reset về giữa.
- **Minimap** góc dưới-phải: thu nhỏ toàn bộ bàn nháp, vẽ khung thật (viền mảnh) + khung nhìn hiện tại
  (viền vàng) — chỉ hiển thị, không tương tác (`pointer-events-none`). Dùng để xác nhận trực quan pan
  có kẹp đối xứng ở cả 2 bên/2 trục hay không.
- Component có `hiddenInBuilder: true` vẫn hiện trong `LayersPanel` để bật lại, nhưng ẩn khỏi vùng
  chọn/kéo trên canvas (Present Mode luôn phớt lờ cờ này — khán giả luôn thấy đúng những gì config
  khai báo).

## Toolbar & phím tắt

Toolbar nổi góc trái trên: **Select** (phím `V`/`Esc`) / **Hand** (phím `H`, tắt khi đã fit-to-screen
vì không còn gì để pan) / **Gridline** (phím `G`) / **Add component** (mở `ComponentPalette`, xem
[properties-panel.md](./properties-panel.md)) / **Layers** (mở/ẩn + sắp xếp component). Không còn nút
"Page settings" riêng — Background giờ thêm/chỉnh qua Add component + Properties Panel như mọi
component khác (xem [properties-panel.md](./properties-panel.md)).

Di chuột vào nút Select/Hand/Gridline hiện 1 popup nhỏ (tên nút + phím tắt, `ToolbarTooltip` trong
`LandingBuilderWindow.tsx`) thay cho tooltip mặc định của trình duyệt — có độ trễ nhỏ để không nhấp
nháy khi rê chuột lướt qua nhiều nút liên tiếp; nút Hand còn tự đổi nội dung popup báo lý do bị tắt
khi đang fit-to-screen.

Phím tắt khác: `Delete`/`Backspace` xoá component đang chọn. Mọi phím tắt tự tắt khi đang gõ trong
input/textarea/select/contentEditable.
