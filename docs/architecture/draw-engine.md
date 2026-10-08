# Draw Engine

File `electron/drawEngine.ts` — phần **nhạy cảm nhất về tính công bằng**, không tự ý đổi thuật toán nếu không được yêu cầu rõ (xem `CLAUDE.md` mục "Việc cần hỏi lại trước khi làm").

**Nguyên tắc kiến trúc: Draw Engine tách biệt hoàn toàn khỏi phần hiển thị.** "Chọn ai trúng" (random có trọng số, loại trừ theo luật) và "hiển thị lên màn hình cho khán giả xem" là 2 việc độc lập: Draw Engine không biết gì về UI; UI (Landing Page, Dashboard) chỉ đọc kết quả Draw Engine trả về, không bao giờ tự tính toán ai trúng.

Tách làm 4 hàm, tách để phục vụ luồng Button Draw/Confirm/Redo trên Landing Page (xem
[`docs/landing/button.md`](../landing/button.md)) mà KHÔNG đổi hành vi của nút "Draw now" cũ (trang Draw):

```ts
pickWinner(opts): DrawCandidate           // CHỌN, KHÔNG ghi DB
recordPendingDraw(candidate, sessionId)   // ghi NGAY confirmed = 0 — gọi trong IPC draw:pick, chỉ để lại lịch sử
commitDraw(candidate, sessionId)          // UPDATE confirmed = 1 trên đúng row rng_seed (fallback INSERT nếu không thấy) + trừ prizes.remaining
drawOne(opts) { return commitDraw(pickWinner(opts), opts.sessionId); }  // hành vi CŨ, không đổi — không có bước pending vì không qua preview
```

### `confirmed` — lịch sử cho Dashboard, KHÔNG ảnh hưởng thuật toán chọn

Trước đây `draw_results` CHỈ chứa lượt đã Confirm — 1 candidate bị Redo (xem trang Landing, nút Redo) không để lại dấu vết gì trong DB. Giờ IPC `draw:pick` gọi `recordPendingDraw` NGAY khi có candidate (trước khi người vận hành kịp Confirm/Redo), ghi 1 row `confirmed = 0`; `commitDraw` (Confirm) chỉ UPDATE đúng row đó (khớp theo `rng_seed`, sinh mới mỗi lần pick nên đủ để nhận diện 1 lượt) lên `confirmed = 1` và mới trừ `prizes.remaining` lúc này — Redo bỏ dở thì row đó giữ mãi `confirmed = 0`, không bao giờ bị sửa lại.

**Mọi truy vấn trong `pickWinner` dùng `draw_results` để tính luật trùng lặp của giải (đã trúng giải nào, `allow_duplicate_with_*`, `max_win_count`) đều lọc `confirmed = 1`** — lượt Redo/bỏ dở KHÔNG được tính là "đã trúng". Riêng participant có ít nhất 1 dòng `confirmed = 0` (bị Draw lại/bỏ qua, hoặc đang chờ Confirm dở lúc tắt app) thì bị **loại khỏi mọi lượt quay sau trong session**, đọc thẳng từ DB nên mang file session sang máy khác quay tiếp vẫn không trùng; chỉ Reset session (xoá `draw_results`) mới quay lại được họ. Luật này độc lập với 2 tuỳ chọn Allow duplicate (không tăng số lần trúng của ai). `sessions:results` (nguồn dữ liệu SỐNG cho Present Mode — Scoreboard/Winner Name, xem `useLandingData.ts`) cũng CHỈ trả `confirmed = 1`, giữ đúng hành vi cũ. Lịch sử ĐẦY ĐỦ (kể cả `confirmed = 0`) dùng IPC riêng `sessions:drawHistory`, chỉ Dashboard đọc — xem [`docs/architecture/database-schema.md`](database-schema.md).

Thuật toán `pickWinner`, theo đúng thứ tự:

1. Lọc `prizes` còn `remaining > 0` và `status = 'active'` (lọc theo `lockedPrizeId` nếu có — ca Redo).
2. Lọc `participants` `status = 'active'`, trừ `excludeParticipantIds` (ca Redo). KHÔNG còn luật cấp session — ai đã trúng gì do luật cấp giải (dưới) quyết định.
3. **Random có trọng số** để chọn 1 giải trong các giải còn hợp lệ (`weight` càng cao càng dễ trúng) — nếu giải đó KHÔNG còn ai đủ điều kiện (do luật trùng lặp cấp giải), loại giải đó và roll lại trong phần còn lại (tránh "chọn trúng giải nhưng không ai nhận được").
4. Random đều (`randomInt`) 1 người trong nhóm đủ điều kiện của giải đã chọn.

### Luật trùng lặp — CHỈ ở cấp giải

`eligibleParticipantsForPrize` xét từng người với giải đang quay, dựa trên lượt đã Confirm:

| Tuỳ chọn trên giải (Prize form) | Ý nghĩa |
|---|---|
| **Allow duplicate with itself** (`allow_duplicate_with_same_prize`) + **Max wins per person** (`max_win_count`) | Bật: 1 người trúng CHÍNH giải này tối đa `max_win_count` lần. Tắt: tối đa 1 lần. |
| **Allow duplicate with other prizes** (`allow_duplicate_with_other_prizes`) | Bật: người đã trúng giải KHÁC vẫn được trúng giải này. Tắt: đã trúng bất kỳ giải nào khác → loại. Chỉ đếm giải KHÁC, lượt trúng chính giải này do tuỳ chọn trên quyết định. |

Luật xét theo **giải đang quay** (có hướng): Bike bật "other", Voucher tắt → trúng Voucher rồi vẫn trúng Bike được, nhưng trúng Bike rồi thì không trúng Voucher nữa. Cả 2 tắt (mặc định giải mới) = mỗi người 1 giải, 1 lần. `quantity`/`remaining` vẫn chặn trên cùng — max 5 mà chỉ còn 2 suất thì hết 2 suất là thôi.

**Bug đã sửa (sau 1.0.0):** (1) session có cờ `exclude_previous_winners` luôn bật (không có UI tắt) loại mọi người đã trúng khỏi TẤT CẢ lượt quay → 2 tuỳ chọn trên vô tác dụng; (2) kiểm tra "other prizes" đếm cả chính giải đang quay → "Allow duplicate with itself" không bao giờ cho trúng lần 2. Nay bỏ hẳn luật cấp session (cột vẫn còn trong DB, luôn 0), session cũ được migration đưa về đúng hành vi cũ — xem [`database-schema.md`](database-schema.md) mục Migration.


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

## Dashboard — nơi đọc lịch sử quay

`src/pages/Dashboard.tsx` — không có tiêu đề lớn/mô tả riêng (trùng nhãn sidebar là dư thừa). CHỈ 1
thanh chỉ số duy nhất ("Overall") theo session đang active, dựng bằng `StatSection`/`Stat`
(`src/components/StatSection.tsx`): 1 tiêu đề nhỏ + 1 lưới **cố định 6 cột** (2 cột màn hẹp, 3 cột màn
vừa, 6 cột màn rộng — dàn thành đúng 1 hàng), các ô ngăn nhau bằng khe `gap-px` lộ nền container thành
đường kẻ mảnh (không dùng viền/`divide-*` — tránh kẻ lệch khi số ô không chia hết cho số cột), hover
đổi màu nhẹ.

| Section | Ô | Nguồn |
|---|---|---|
| Overall | Participants (original) · Participants (current) · Total prizes · Awarded prizes · Total draws · Confirmed draws | `participants:stats`/`participants.list`/`prizes.list`/`sessions.drawHistory` |

Mỗi section PHẢI giữ đúng bội số cột ở MỌI breakpoint (2/3/6) — nếu lệch, ô trống cuối hàng sẽ lộ mảng
nền kẻ (không có filler tự động). Trước đây có 3 section riêng (Participants/Prizes/Draw, 4 ô/section)
— đã gộp thành 1 thanh "Overall" duy nhất theo yêu cầu rút gọn.

Bên dưới thanh "Overall" là **1 bảng duy nhất** — **Draw ▸ History** — đọc `sessions.drawHistory` (IPC
riêng, KHÁC `sessions.results` — xem mục [`confirmed`](#confirmed--lịch-sử-cho-dashboard-không-ảnh-hưởng-thuật-toán-chọn)
ở trên): log đầy đủ từng lượt quay thực tế (mới nhất trước, `ORDER BY drawn_at DESC` từ `main.ts`) —
Time/Prize/Participant/Status, kể cả lượt bị Redo (`confirmed = 0`, chip xám "Not confirmed") mà
`sessions.results` (nguồn Present Mode) không bao giờ trả về. Đây là nguồn dữ liệu chi tiết DUY NHẤT
của phần Draw — không có bảng tổng hợp phụ nào khác; "Total draws"/"Confirmed draws" ở thanh "Overall"
đều suy ra từ chính bảng này.

Soft-delete participants (`status: "active" | "removed"`, xem
[database-schema.md](./database-schema.md) và [participants/schema.md](../participants/schema.md))
là nền tảng cho bộ số liệu original/current này — xoá 1 dòng trong Data Editor chỉ đánh dấu
`removed`, không `DELETE` thật, nên Dashboard vẫn đếm lại được số liệu gốc. **Hệ quả**: dữ liệu xoá
TRƯỚC khi cơ chế soft-delete tồn tại không tính vào "original" — con số chỉ đúng từ lúc thêm cơ chế
này trở đi.
