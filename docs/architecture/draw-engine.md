# Draw Engine

File `electron/drawEngine.ts` — phần **nhạy cảm nhất về tính công bằng**, không tự ý đổi thuật toán nếu không được yêu cầu rõ (xem `CLAUDE.md` mục "Việc cần hỏi lại trước khi làm").

Tách làm 4 hàm, tách để phục vụ luồng Button Draw/Confirm/Redo trên Landing Page (xem
[`docs/landing/button-actions.md`](../landing/button-actions.md)) mà KHÔNG đổi hành vi của nút "Draw now" cũ (trang Draw):

```ts
pickWinner(opts): DrawCandidate           // CHỌN, KHÔNG ghi DB
recordPendingDraw(candidate, sessionId)   // ghi NGAY confirmed = 0 — gọi trong IPC draw:pick, chỉ để lại lịch sử
commitDraw(candidate, sessionId)          // UPDATE confirmed = 1 trên đúng row rng_seed (fallback INSERT nếu không thấy) + trừ prizes.remaining
drawOne(opts) { return commitDraw(pickWinner(opts), opts.sessionId); }  // hành vi CŨ, không đổi — không có bước pending vì không qua preview
```

### `confirmed` — lịch sử cho Dashboard, KHÔNG ảnh hưởng thuật toán chọn

Trước đây `draw_results` CHỈ chứa lượt đã Confirm — 1 candidate bị Redo (xem trang Landing, nút Redo) không để lại dấu vết gì trong DB. Giờ IPC `draw:pick` gọi `recordPendingDraw` NGAY khi có candidate (trước khi người vận hành kịp Confirm/Redo), ghi 1 row `confirmed = 0`; `commitDraw` (Confirm) chỉ UPDATE đúng row đó (khớp theo `rng_seed`, sinh mới mỗi lần pick nên đủ để nhận diện 1 lượt) lên `confirmed = 1` và mới trừ `prizes.remaining` lúc này — Redo bỏ dở thì row đó giữ mãi `confirmed = 0`, không bao giờ bị sửa lại.

**Mọi truy vấn trong `pickWinner` dùng `draw_results` để loại trừ (đã trúng giải nào, `exclude_previous_winners`, `allow_duplicate_with_*`) đều lọc `confirmed = 1`** — lượt Redo/bỏ dở KHÔNG được tính là "đã trúng", không loại participant khỏi vòng quay sau. `sessions:results` (nguồn dữ liệu SỐNG cho Present Mode — Scoreboard/Winner Name, xem `useLandingData.ts`) cũng CHỈ trả `confirmed = 1`, giữ đúng hành vi cũ. Lịch sử ĐẦY ĐỦ (kể cả `confirmed = 0`) dùng IPC riêng `sessions:drawHistory`, chỉ Dashboard đọc — xem [`docs/architecture/database-schema.md`](database-schema.md).

Thuật toán `pickWinner`, theo đúng thứ tự:

1. Lọc `prizes` còn `remaining > 0` và `status = 'active'` (lọc theo `lockedPrizeId` nếu có — ca Redo).
2. Lọc `participants` `status = 'active'`, trừ người đã trúng (nếu session bật `exclude_previous_winners`), trừ `excludeParticipantIds` (ca Redo).
3. **Random có trọng số** để chọn 1 giải trong các giải còn hợp lệ (`weight` càng cao càng dễ trúng) — nếu giải đó KHÔNG còn ai đủ điều kiện (do luật trùng lặp cấp giải), loại giải đó và roll lại trong phần còn lại (tránh "chọn trúng giải nhưng không ai nhận được").
4. Random đều (`randomInt`) 1 người trong nhóm đủ điều kiện của giải đã chọn.

Luật trùng lặp cấp giải (`eligibleParticipantsForPrize`): `allow_duplicate_with_same_prize` + `max_win_count` (1 người trúng ĐÚNG giải này tối đa bao nhiêu lần), `allow_duplicate_with_other_prizes` (đã trúng giải KHÁC thì có được trúng tiếp giải này không).

## Chọn ai trúng KHÔNG phụ thuộc "cột nào tên gì"

Thuật toán chọn (`pickWinner`) ở trên chỉ thao tác trên `participant.id`/`status` — không đọc `name`/`phone`/`code`/`email`/`extra_data` ở BẤT KỲ bước nào của việc CHỌN. Đây là lý do phần "hiển thị cột nào là Name" (xem dưới) đổi thoải mái mà không đụng gì tới tính công bằng của thuật toán random — 2 việc tách biệt hoàn toàn.

## Tên hiển thị của người trúng — đọc ĐỘNG, không đọc cứng `participant.name`

`participantName` trên `DrawCandidate` (trả về từ `pickWinner`, dùng để hiện lên Winner Name TRƯỚC khi Confirm) và `participant_name`/`participant_phone`/`participant_code`/`participant_email` trên kết quả đã Confirm (`sessions:results` trong `main.ts`) đều KHÔNG đọc cứng cột SQL — resolve theo đúng cột nào đang được Data Editor gán Data Type tương ứng (Name/Phone/Code/Email), dù cột đó vật lý nằm ở cột SQL lõi hay trong `extra_data`. Xem [`docs/participants/column-mapping.md`](../participants/column-mapping.md) mục "3 bản sao" — bản dùng ở đây là `electron/participantFields.ts` (`resolveParticipantField`/`computeActiveCoreFields`), vì `electron/` không import được code từ `src/`.

Hệ quả: import 1 file Google Form với cột "Hãy cho KidsPlaza biết đầy đủ Họ và Tên của Mẹ nha!", gán Data Type = "Name" cho đúng cột đó trong Data Editor — KHÔNG cần sửa gì ở `drawEngine.ts`/`main.ts`, Winner Name/Scoreboard tự hiện đúng giá trị. Chưa gán Data Type nào cho session đó → fallback về cột SQL `name`/`phone`/`code`/`email` (tương thích ngược với dữ liệu tạo trước khi có thiết kế này).

**Bug đã sửa: Winner Name hiện tên rỗng dù participant có tên thật ở cột `extra_data`** — `pickWinner`
(`drawEngine.ts`) và `resolveDrawRows`/`sessions:results` (`main.ts`) đều tự tính `activeCoreFields`
(cột SQL lõi nào "đang có dữ liệu thật" trong session, xem `computeActiveCoreFields` trong
`electron/participantFields.ts`) bằng 1 câu `SELECT ... FROM participants WHERE session_id = ?` **QUÊN
lọc `status != 'removed'`** — khác hẳn `participants:list` (đã lọc đúng). Hệ quả: 1 session đã từng
"Replace" import (xoá SOFT-DELETE, không xoá thật khỏi DB — xem `docs/participants/schema.md`) từ 1
batch CŨ còn ghi thẳng cột SQL `name`/`phone`/... (trước khi đổi hẳn sang generic `extra_data`) khiến
`activeCoreFields` tưởng nhầm cột đó "đang active" dù KHÔNG participant thật (active) nào còn dùng nó
— `resolveParticipantField` dừng lại NGAY ở cột SQL rỗng đó (return sớm ở vòng lặp core field), không
bao giờ tới lượt kiểm tra cột `extra_data` thật (vd `full_name`) đang chứa tên thật. Sửa bằng cách
thêm `AND status != 'removed'` vào cả 2 câu `SELECT` trên, khớp đúng ý định gốc của comment "tính trên
TOÀN BỘ participants của session... để khớp đúng những gì Data Editor đang hiện".
