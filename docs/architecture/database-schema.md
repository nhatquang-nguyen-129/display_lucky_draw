# SQLite schema + chiến lược migration

> Chi tiết riêng cho `participants` (cột `extra_data`, 2 tầng field, `participant_column_types`...)
> xem [`docs/participants/schema.md`](../participants/schema.md) — file này là bức tranh toàn bộ 4
> bảng + cách viết migration an toàn.

```mermaid
erDiagram
  SESSIONS ||--o{ PARTICIPANTS : session_id
  SESSIONS ||--o{ PRIZES : session_id
  SESSIONS ||--o{ DRAW_RESULTS : session_id
  PARTICIPANTS ||--o{ DRAW_RESULTS : participant_id
  PRIZES ||--o{ DRAW_RESULTS : prize_id

  SESSIONS {
    text id PK
    text name
    integer allow_duplicate_prize
    integer exclude_previous_winners
    text landing_config "JSON — LandingConfig"
    text participant_column_types "JSON — { col: ColumnType }"
    text participant_duplicate_columns "JSON string[] — KHÔNG CÒN DÙNG, xem participants/schema.md"
    text participant_column_labels "JSON — { col: nhãn hiển thị tuỳ biến, chỉ core field }"
  }
  PARTICIPANTS {
    text id PK
    text session_id FK
    text name
    text phone
    text code
    text email
    text extra_data "JSON — cột optional tự thêm"
    integer sort_order
    text status "active | removed (soft-delete)"
  }
  PRIZES {
    text id PK
    text session_id FK
    text name
    integer quantity
    integer remaining
    real weight
    integer allow_duplicate_with_other_prizes
    integer allow_duplicate_with_same_prize
    integer max_win_count
    text display_image "base64"
  }
  DRAW_RESULTS {
    text id PK
    text session_id FK
    text participant_id FK
    text prize_id FK
    text rng_seed
    integer confirmed "1 = đã Confirm thật; 0 = đã pick nhưng bị Redo/bỏ dở, chỉ để Dashboard xem lịch sử"
  }
```

`electron/db.ts` là nơi DUY NHẤT chứa schema + migration. Pattern lặp lại cho MỌI migration trong file này (xem `migrateSessionColumnTypes`, `migrateParticipantSortOrder`...):

```ts
function migrateXxx() {
  const cols = (db.prepare(`PRAGMA table_info(<table>)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("<cột mới>")) {
    db.exec(`ALTER TABLE <table> ADD COLUMN <cột mới> <type>`);
  }
}
migrateXxx(); // gọi ngay dưới định nghĩa, chạy mỗi lần app khởi động
```

An toàn khi chạy lại nhiều lần (idempotent — luôn kiểm tra cột đã tồn tại chưa trước khi `ALTER`), không bao giờ `DROP`/mất dữ liệu cũ. Khi cần đổi CẤU TRÚC bảng (không chỉ thêm cột — vd bỏ ràng buộc `UNIQUE` toàn cục), pattern là: tạo bảng `_new`, `INSERT ... SELECT` copy dữ liệu cũ sang, `DROP` bảng cũ, `RENAME` bảng mới về tên cũ (xem `migrateToPerSessionData`, đổi từ participants toàn app dùng chung sang participants theo từng session).

**Trước khi sửa `db.ts`**: luôn hỏi lại người dùng nếu thay đổi liên quan tới schema — không được viết migration phá dữ liệu người dùng đã có (xem `CLAUDE.md` mục "Việc cần hỏi lại trước khi làm").
