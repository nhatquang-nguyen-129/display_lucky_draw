# Session Lock — khoá session (2 mức: Input lock / Full lock)

## Vì sao có tính năng này

Sau khi chốt danh sách hoặc quay xong 1 sự kiện, rất dễ vô tình bấm nhầm: sửa/xoá 1 participant hay
prize, mở lại Presentation, mở Landing Builder — làm sai lệch dữ liệu/kết quả mà không ai để ý ngay.
Session Lock là công tắc khoá cho từng session, mục đích DUY NHẤT là **tránh thao tác nhầm**, không
phải 1 lớp bảo mật.

Có 2 mức:

| Mức | `sessions.locked` | Dùng khi | Khoá gì |
|---|---|---|---|
| Mở | `0` | Đang chuẩn bị | Không khoá gì |
| **Input lock** | `2` | Đã chốt danh sách participant + prize, sắp/đang quay | Chỉ **dữ liệu đầu vào**: participant, prize, Data Editor (cả data type/nhãn cột), tuỳ chọn quay, xoá session. Quay số, Landing Builder, Presentation, đổi tên/đóng tab vẫn **thoải mái** |
| **Full lock** | `1` | Đã quay xong, giữ kết quả cuối | **Toàn bộ** — session chỉ xem |

`1` = Full lock là giá trị CŨ (trước khi có Input lock, cột chỉ có 0/1) — giữ nguyên nghĩa để DB cũ
đang khoá vẫn khoá toàn bộ như trước. Input lock dùng giá trị mới `2` trên cùng cột INTEGER, nên
**không cần migration**.

**Không có password, không có cơ chế khôi phục.** Ai cũng đổi được mức khoá. Khác biệt duy nhất: đổi
sang mức **chặt hơn** (Mở → Input → Full) có hiệu lực ngay; **nới lỏng** (Full → Input, Full → Mở,
Input → Mở) bắt buộc giữ nút 3 giây (tránh bấm nhầm).

## Schema — `electron/db.ts`

Cột `sessions.locked` (`INTEGER NOT NULL DEFAULT 0`), thêm qua `addColumnIfMissing` trong
`ensureSchema()` — migration additive đơn thuần, không cần `user_version` (xem
[`database-schema.md`](./database-schema.md#migration)).

Kiểu `SessionLockLevel = 0 | 1 | 2`, hằng `LOCK_FULL = 1`, `LOCK_INPUTS = 2`. Các hàm hỗ trợ, đặt cạnh
`renameSession`/`deleteSession`:

- `setSessionLocked(sessionId, level)` — `UPDATE sessions SET locked = ?`.
- `assertInputsUnlocked(sessionId)` — throw nếu `locked` là **1 hoặc 2** (mọi mức khoá). Dùng cho hành
  động đổi dữ liệu đầu vào.
- `assertSessionUnlocked(sessionId)` — throw chỉ khi `locked = 1` (Full lock). Dùng cho mọi hành động
  còn lại.

Cả 2 đọc `locked` của đúng file DB session đó (`getDb(sessionId)`, mỗi file 1 dòng `sessions`).

Renderer có bản song song ở `src/lib/sessionLock.ts` (`inputsLocked()`, `fullyLocked()`,
`inputLockTitle()`, hằng `LOCK_NONE/LOCK_FULL/LOCK_INPUTS`) — chỉ để disable nút/tooltip
(`electron/` không import được `src/`).

## Chặn ở tầng IPC — lớp thật, không chỉ ẩn nút

1 trong 2 hàm assert là dòng ĐẦU TIÊN trong thân mỗi `ipcMain.handle` dưới đây (`electron/main.ts`) —
nút bấm ở renderer bị disable khi khoá, nhưng đây mới là chỗ thực sự chặn (vd gọi thẳng qua DevTools
console vẫn bị reject):

| Nhóm | IPC handler | Hàm chặn | Input lock | Full lock |
|---|---|---|---|---|
| Participant | `participants:create/update/bulkImport/delete/bulkDelete/reorder` | `assertInputsUnlocked` | chặn | chặn |
| Prize | `prizes:create/update/delete` | `assertInputsUnlocked` | chặn | chặn |
| Cấu hình dữ liệu | `sessions:updateColumnTypes/updateColumnLabels/updateOptions` | `assertInputsUnlocked` | chặn | chặn |
| Xoá session | `sessions:delete` (chuyển vào trash) | `assertInputsUnlocked` | chặn | chặn |
| Mở cửa sổ | `dataEditor:open` | `assertInputsUnlocked` | chặn | chặn |
| Draw | `draw:one/pick/commit/resetSession` | `assertSessionUnlocked` | **cho phép** | chặn |
| Landing | `sessions:updateLandingConfig`, `media:importVideo` | `assertSessionUnlocked` | **cho phép** | chặn |
| Mở cửa sổ | `present:open`, `landingBuilder:open` | `assertSessionUnlocked` | **cho phép** | chặn |
| Tab | `sessions:rename`, `sessions:setClosed` (nút ×) | `assertSessionUnlocked` | **cho phép** | chặn |

Ghi chú:
- `draw:commit`/`draw:resetSession` có đổi `participants.status`/số lượng còn lại của prize, nhưng đó là
  **kết quả quay**, không phải dữ liệu đầu vào — nên Input lock cho phép (đúng mục đích "khoá danh sách
  rồi quay thoải mái").
- `sessions:delete` bị Input lock chặn vì xoá session = mất luôn dữ liệu đầu vào. Đóng tab (nút ×, chỉ
  ẩn, không đụng file) thì vẫn được.

**Thêm IPC mới** ghi dữ liệu của 1 session hay mở cửa sổ edit → thêm 1 trong 2 hàm vào đầu handler:
đụng participant/prize/cấu hình dữ liệu → `assertInputsUnlocked`; còn lại → `assertSessionUnlocked`.

Endpoint để đổi trạng thái: `sessions:setLocked` (`{ id, locked: 0 | 1 | 2 }`) → `{ ok, openWindows }`,
theo đúng khuôn IPC 3 lớp (`main.ts` → `preload.ts` → `Window.api` trong `src/types.ts`) như mọi
endpoint khác — xem [`ipc-and-windows.md`](./ipc-and-windows.md#ipc-3-lớp-bắt-buộc-đồng-bộ). **Khoá bị
từ chối** (`ok: false`) khi session còn mở cửa sổ mà mức khoá mới sẽ chặn — khoá giữa chừng sẽ làm cửa
sổ đó lỗi ở lần ghi/quay tiếp theo hoặc mất thay đổi chưa Save; `SessionLockMenu.tsx` báo người dùng
đóng các cửa sổ đó trước:
- Input lock: chỉ từ chối khi đang mở **Data Editor** (Builder/Presentation cứ để mở).
- Full lock: từ chối khi đang mở Data Editor, Landing Builder hoặc Presentation.

Mở khoá (về 0) thì luôn được.

## Giao diện

- **Đổi mức khoá**: chuột phải (Windows) hoặc secondary-click trên trackpad / **Option + click**
  (macOS) vào 1 tab trong `TabBar.tsx` → menu nổi `SessionLockMenu.tsx`. Các lựa chọn tuỳ trạng thái:

  | Đang ở | Lựa chọn trong menu |
  |---|---|
  | Mở | **Lock inputs** (→ Input lock), **Lock session** (→ Full lock), Move to trash |
  | Input lock | **Lock session** (→ Full lock), **Unlock inputs** (→ Mở, giữ 3s) |
  | Full lock | **Switch to input lock** (→ Input lock, giữ 3s), **Unlock session** (→ Mở, giữ 3s) |

  Trình duyệt tự chuẩn hoá sự kiện `contextmenu` giữa các cách bấm chuột phải; Option + click là 1
  `click` có `altKey`, `TabBar.tsx` bắt riêng.
- **Giữ 3 giây** (`HoldToUnlockButton.tsx`, dùng `requestAnimationFrame` chạy thanh fill, thả sớm là
  huỷ) cho mọi chiều nới lỏng — bảng `STRICTNESS` trong `SessionLockMenu.tsx` quyết định chiều nào là
  nới lỏng.
- **Icon ổ khoá** cạnh tên tab trong `TabBar.tsx`: **xám** = Full lock, **xanh nhạt (teal-500)** = Input
  lock; tooltip của tab nói rõ mức đang khoá.
- **Tab Full lock**: double-click không đổi tên, nút × (đóng tab) ẩn đi. Tab Input lock vẫn đổi tên/đóng
  được bình thường.
- **Nút bị vô hiệu hoá** (giữ nguyên hiển thị, chỉ thêm `disabled` + tooltip, không ẩn):

  | File | Nút | Input lock | Full lock |
  |---|---|---|---|
  | `src/pages/Participants.tsx` | Edit (mở Data Editor), Import/Replace, Delete (Clear All) | disable | disable |
  | `src/pages/Prizes.tsx` | Add, Edit, Delete | disable | disable |
  | `src/pages/LandingPage.tsx` | Presentation, Builder | bấm được | disable |

  Dashboard/bảng participant/prize (ngoài modal) vẫn xem bình thường ở mọi mức — khoá không ẩn dữ liệu.

## Thêm 1 hành động mới cần bị khoá chặn

1. Thêm `assertInputsUnlocked(sessionId)` (hành động đổi dữ liệu đầu vào) hoặc
   `assertSessionUnlocked(sessionId)` (mọi thứ khác) làm dòng đầu trong `ipcMain.handle` tương ứng
   (`electron/main.ts`) — đây là lớp chặn THẬT, bắt buộc.
2. Thêm `disabled={inputsLocked(activeSession)}` hoặc `disabled={fullyLocked(activeSession)}` (+ tooltip,
   `src/lib/sessionLock.ts`) vào nút gọi hành động đó ở renderer — chỉ là UX, không thay thế được bước 1.
