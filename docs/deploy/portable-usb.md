# Portable USB — 1 USB mang theo cả app lẫn dữ liệu

> **Trạng thái: KẾ HOẠCH, CHƯA IMPLEMENT.** Hiện tại bản portable vẫn lưu dữ liệu ở
> `%APPDATA%\Lucky Draw Studio\lucky-draw.db` (xem [`electron/db.ts`](../../electron/db.ts)), KHÔNG
> nằm cạnh file exe — copy riêng file exe sang máy khác sẽ mở ra app TRỐNG. Tài liệu này mô tả mục
> tiêu và thiết kế đã chốt để implement sau.

## Mục tiêu

Chuẩn bị xong mọi thứ ở nhà (participant, prize, landing page với đủ component/ảnh) → copy vào 1 USB
→ tới venue cắm USB vào máy bất kỳ, double-click là chạy, **có sẵn toàn bộ dữ liệu**. Không cài đặt,
không cần quyền Admin, không phải biết thư mục ẩn nào. Kết quả quay cũng ghi ngược vào USB, cầm về
là có đủ.

## Vì sao làm được dễ

Toàn bộ dữ liệu của app nằm trong **đúng 1 file SQLite** — không có file ảnh rời nào bên ngoài:

| Dữ liệu | Nằm ở đâu trong DB |
|---|---|
| Session (tab quay số) | bảng `sessions` |
| Participant | bảng `participants` (cột file import nằm trong `extra_data`) |
| Prize, kể cả ảnh giải | bảng `prizes` (`display_image` — base64) |
| Landing page: component, ảnh nền, ảnh PNG | `sessions.landing_config` (JSON, ảnh nhúng base64) |
| Kết quả quay | bảng `draw_results` |

Chi tiết schema: [`docs/architecture/database-schema.md`](../architecture/database-schema.md).

## Cấu trúc USB

```
USB:\LuckyDraw\
├── Lucky Draw Studio-<version>-portable.exe
└── lucky-draw.db          ← toàn bộ dữ liệu (tự tạo nếu chưa có)
```

Lúc app đang chạy sẽ có thêm `lucky-draw.db-wal`/`lucky-draw.db-shm` cạnh đó (file tạm của SQLite ở
chế độ WAL) — bình thường, tự gộp vào `lucky-draw.db` khi tắt app.

## Thiết kế (để implement)

- **Chế độ portable → DB nằm cạnh exe.** electron-builder tự đặt biến môi trường
  `PORTABLE_EXECUTABLE_DIR` (thư mục chứa file exe portable) khi chạy bản portable. `electron/db.ts`
  dùng thư mục đó thay cho `app.getPath("userData")` khi biến này có giá trị.
- **Bản Setup (NSIS) và `npm run electron:dev` giữ nguyên** — vẫn lưu ở `%APPDATA%` như cũ, vì 2
  trường hợp này không có biến `PORTABLE_EXECUTABLE_DIR`.
- **Không đổi schema, không cần migration** — chỉ đổi VỊ TRÍ file DB. File `.db` cũ copy từ
  `%APPDATA%` sang dùng được ngay (các hàm `migrate...()` trong `db.ts` vẫn tự chạy như bình thường).
- **Chưa có `lucky-draw.db` cạnh exe** → tự tạo DB trống ở đó (giống lần đầu mở app hiện tại).

### Vì sao KHÔNG nhúng DB vào bên trong file exe

Đã cân nhắc phương án "1 file exe duy nhất, DB nhúng sẵn bên trong" (qua `extraResources`) và loại bỏ:

- File exe portable thực chất tự giải nén ra thư mục tạm mỗi lần chạy — app **không ghi ngược được
  vào trong exe**. Kết quả quay sẽ nằm ở `%APPDATA%` của máy venue, không theo USB về.
- Dữ liệu bị "đóng băng" lúc build — sửa 1 participant hay 1 component cũng phải build lại exe.

Để 2 file (exe + db) trong cùng 1 thư mục trên USB vẫn đúng tinh thần "cầm 1 USB là xong", mà dữ
liệu sửa/đọc/ghi thẳng được.

## Quy trình chuẩn bị (sau khi implement)

1. Chạy app trên máy của mình, nhập participant/prize, dựng landing page — test quay thử nếu cần
   (Reset session trước khi mang đi để không lẫn kết quả thử).
2. **Tắt hẳn app** — bắt buộc, để SQLite gộp hết dữ liệu từ `-wal` vào đúng file `lucky-draw.db`.
   Copy lúc app còn đang chạy có thể mất phần dữ liệu mới nhất.
3. `npm run package` → lấy file `…-portable.exe` trong `release/`.
4. Tạo thư mục trên USB, chép vào: file exe + `lucky-draw.db` (lấy từ
   `%APPDATA%\Lucky Draw Studio\` nếu chuẩn bị bằng bản dev/Setup, hoặc lấy thẳng cạnh exe nếu chuẩn
   bị bằng chính bản portable).
5. Test lại trên 1 máy khác trước ngày sự kiện: mở từ USB, thấy đủ session/participant/prize/landing.

## Lưu ý khi vận hành tại venue

- **USB phải cho phép ghi** — app ghi kết quả quay và cấu hình vào `lucky-draw.db`. Không để thư mục
  trên ổ chỉ-đọc (CD, ổ mạng read-only, USB có khoá write-protect).
- **Không rút USB khi app đang chạy** — có thể hỏng file DB. Tắt app trước, rồi mới rút.
- **Luôn giữ 1 bản sao `lucky-draw.db`** ở nơi khác (máy mình/cloud) trước khi đi — USB hỏng/mất là
  mất cả dữ liệu lẫn kết quả.
- **Chỉ mở 1 cửa sổ app** từ cùng 1 thư mục USB tại 1 thời điểm.
- USB chậm (USB 2.0 cũ) có thể làm app mở chậm hơn chạy từ ổ cứng — nên test trước với đúng USB sẽ
  mang đi.

## Sau sự kiện

Tắt app → cầm USB về. `lucky-draw.db` trên USB đã có đầy đủ kết quả quay (`draw_results`) — mở bằng
chính app (bản portable trên USB, hoặc copy file vào `%APPDATA%\Lucky Draw Studio\` để xem bằng bản
dev/Setup) để xem lại/xuất kết quả.
