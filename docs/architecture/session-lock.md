# Session Lock — khoá session sau khi quay xong

## Vì sao có tính năng này

Sau khi quay xong 1 sự kiện, rất dễ vô tình bấm nhầm: mở lại Presentation, mở Landing Builder, sửa/xoá
1 participant hay prize — làm sai lệch kết quả đã quay mà không ai để ý ngay. Session Lock là 1 công
tắc khoá/mở khoá cho từng session, mục đích DUY NHẤT là **tránh thao tác nhầm sau khi đã có kết quả
cuối**, không phải 1 lớp bảo mật.

**Không có password, không có cơ chế khôi phục.** Khoá/mở khoá là 2 hành động đối xứng, ai cũng bấm
được — khác biệt duy nhất giữa 2 chiều là mở khoá cần giữ nút 3 giây (tránh bấm nhầm), còn khoá thì có
hiệu lực ngay.

## Schema — `electron/db.ts`

Cột `sessions.locked` (`INTEGER NOT NULL DEFAULT 0`), thêm qua `addColumnIfMissing` trong
`ensureSchema()` — migration additive đơn thuần, không cần `user_version` (xem
[`database-schema.md`](./database-schema.md#migration)).

Hai hàm hỗ trợ, đặt cạnh `renameSession`/`deleteSession`:

- `setSessionLocked(sessionId, locked)` — `UPDATE sessions SET locked = ?`.
- `assertSessionUnlocked(sessionId)` — đọc `locked` của đúng file DB session đó (`getDb(sessionId)`,
  mỗi file 1 dòng `sessions`), `throw new Error("Session is locked")` nếu đang khoá.

## Chặn ở tầng IPC — lớp thật, không chỉ ẩn nút

`assertSessionUnlocked(sessionId)` là dòng ĐẦU TIÊN trong thân mỗi `ipcMain.handle` dưới đây
(`electron/main.ts`) — nút bấm ở renderer bị disable khi khoá, nhưng đây mới là chỗ thực sự chặn (vd
gọi thẳng qua DevTools console vẫn bị reject):

| Nhóm | IPC handler |
|---|---|
| Participant | `participants:create/update/bulkImport/delete/bulkDelete/reorder` |
| Prize | `prizes:create/update/delete` |
| Session config | `sessions:updateLandingConfig/updateOptions/updateColumnTypes/updateColumnLabels` |
| Tab | `sessions:rename`, `sessions:delete` (đóng tab) |
| Draw | `draw:one/pick/commit/resetSession` |
| Mở cửa sổ | `present:open`, `landingBuilder:open`, `dataEditor:open` |

Session đang khoá là **chỉ xem hoàn toàn**: không đổi tên, không đóng tab được (bản đầu cố ý để 2 thao
tác này ngoài khoá, sau đó đổi theo yêu cầu). Thêm IPC mới ghi dữ liệu của 1 session hay mở cửa sổ edit
→ nhớ thêm `assertSessionUnlocked` vào đầu handler, theo đúng bảng trên.

Endpoint để đổi trạng thái: `sessions:setLocked` (`{ id, locked }`) → `{ ok, openWindows }`, theo đúng
khuôn IPC 3 lớp (`main.ts` → `preload.ts` → `Window.api` trong `src/types.ts`) như mọi endpoint khác —
xem [`ipc-and-windows.md`](./ipc-and-windows.md#ipc-3-lớp-bắt-buộc-đồng-bộ). **Khoá bị từ chối**
(`ok: false`) khi session còn mở Data Editor/Landing Builder/Presentation — khoá giữa chừng sẽ làm cửa sổ
đó lỗi ở lần ghi/quay tiếp theo hoặc mất thay đổi chưa Save; `SessionLockMenu.tsx` báo người dùng đóng
các cửa sổ đó trước. Mở khoá thì luôn được.

## Giao diện

- **Khoá/mở khoá**: chuột phải (Windows) hoặc secondary-click trên trackpad / **Option + click**
  (macOS) vào 1 tab trong `TabBar.tsx` → menu nổi `SessionLockMenu.tsx`, đúng 1 lựa chọn tuỳ trạng thái
  hiện tại ("Lock session" / "Unlock session"). Trình duyệt tự chuẩn hoá sự kiện `contextmenu` giữa các
  cách bấm chuột phải; Option + click là 1 `click` có `altKey`, `TabBar.tsx` bắt riêng.
- **Tab đang khoá**: double-click không đổi tên, nút × (đóng tab) ẩn đi.
- **Khoá**: có hiệu lực ngay, không cần xác nhận thêm (chiều "an toàn").
- **Mở khoá**: bắt buộc giữ nút 3 giây (`HoldToUnlockButton.tsx`, dùng `requestAnimationFrame` chạy
  thanh fill, thả sớm là huỷ, không có class thao tác nào ngắn hơn 3s có tác dụng) — đây là điểm khác
  biệt duy nhất so với Khoá, để tránh 1 cú bấm nhầm làm mất tác dụng khoá.
- **Icon ổ khoá** hiện cạnh tên tab trong `TabBar.tsx` khi `session.locked === 1`.
- **8 nút bị vô hiệu hoá khi khoá** (giữ nguyên hiển thị, chỉ thêm `disabled` + tooltip, không ẩn):

  | File | Nút |
  |---|---|
  | `src/pages/Participants.tsx` | Edit (mở Data Editor), Import/Replace, Delete (Clear All) |
  | `src/pages/Prizes.tsx` | Add, Edit, Delete |
  | `src/pages/LandingPage.tsx` | Presentation, Builder |

  Dashboard/bảng participant/prize (ngoài modal) vẫn xem bình thường — khoá là chế độ chỉ xem, không
  ẩn dữ liệu.

## Thêm 1 hành động mới cần bị khoá chặn

1. Thêm `assertSessionUnlocked(sessionId)` làm dòng đầu trong `ipcMain.handle` tương ứng
   (`electron/main.ts`) — đây là lớp chặn THẬT, bắt buộc.
2. Thêm `disabled={activeSession?.locked === 1}` (+ tooltip) vào nút gọi hành động đó ở renderer —
   chỉ là UX, không thay thế được bước 1.
