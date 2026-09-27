# Schema — participants & cột cấu hình ở sessions

Toàn bộ 4 bảng + chiến lược migration: [`docs/architecture/database-schema.md`](../architecture/database-schema.md).
File này chỉ đi sâu phần participant.

## Bảng `participants`

```sql
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,       -- LUÔN lọc theo cột này ở mọi query/IPC mới
  code TEXT,
  name TEXT NOT NULL,             -- có thể là "" — NOT NULL chỉ cấm NULL
  phone TEXT,
  email TEXT,
  extra_data TEXT,                -- JSON — mọi cột khác, kể cả toàn bộ dữ liệu import mới
  sort_order INTEGER,
  source TEXT DEFAULT 'manual',   -- 'manual' | 'import'
  status TEXT DEFAULT 'active',   -- 'active' | 'removed' (soft-delete)
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 2 tầng field — giờ chỉ còn ý nghĩa LƯU TRỮ

| Tầng | Cột | Ý nghĩa hiện tại |
|---|---|---|
| Cột lõi (SQL thật) | `name`, `phone`, `code`, `email` | Giữ để không phá dữ liệu session tạo trước khi có [import generic](./import.md). Import mới không ghi vào đây — `name = ""` mãi mãi là trạng thái hợp lệ |
| Cột phụ | Mọi cột khác, gộp trong JSON `extra_data` | Không có schema cố định — thêm/xoá/đổi tên tự do trong Data Editor hoặc sinh ra từ import |

"Cột lõi" KHÔNG còn nghĩa là "quan trọng hơn" hay "field app đọc": "Name/Phone… của participant là gì"
xác định động qua `participant_column_types` ([column-mapping.md](./column-mapping.md)), có thể trỏ vào 1
cột trong `extra_data`. Draw Engine (thuật toán CHỌN ai trúng) chỉ dùng `id`/`status`, chưa bao giờ đọc
field dữ liệu nào — xem [`docs/architecture/draw-engine.md`](../architecture/draw-engine.md).

**Soft-delete**: xoá dòng trong Data Editor chỉ đặt `status = 'removed'`, không `DELETE` thật — nhờ vậy
Dashboard còn đếm được số liệu gốc. Mọi query "participant hiện tại" phải lọc `status != 'removed'`
(đã từng gặp bug thiếu điều kiện này ở Draw Engine, xem draw-engine.md).

## Cột cấu hình ở `sessions` (per-session, JSON text)

| Cột | Nội dung | Trạng thái |
|---|---|---|
| `participant_column_types` | `{ [tênCột]: "name" \| "phone" \| "email" \| "code" \| "url" \| "text" }` — Data Type của mọi cột | Dùng — validate + resolve "cột nào là Name/Phone…" |
| `participant_column_labels` | `{ [tênCột]: "Nhãn hiển thị" }` — chỉ cho cột lõi | Dùng |
| `participant_duplicate_columns` | `string[]` — cột làm khoá trùng lặp | **Không còn dùng** — giữ trong schema để không phá DB cũ. Trùng lặp giờ lấy theo cột đang bôi chọn ([data-editor.md](./data-editor.md#chip-trùng-lặp--live-theo-cột-đang-bôi)) |

Cả 3 thêm bằng migration idempotent trong `db.ts` (`ALTER TABLE … ADD COLUMN` nếu chưa có, không bao giờ
`DROP`).

## Đổi schema

Theo `CLAUDE.md`: mọi thay đổi bảng `participants`/`sessions` phải kèm migration an toàn (mẫu: các hàm
`migrate…()` cuối `db.ts`), không `DROP`/`ALTER` phá dữ liệu người dùng, và **hỏi lại trước khi làm**.
