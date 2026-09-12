# Draw Engine

File `electron/drawEngine.ts` — phần **nhạy cảm nhất về tính công bằng**, không tự ý đổi thuật toán nếu không được yêu cầu rõ (xem `CLAUDE.md` mục "Việc cần hỏi lại trước khi làm").

Tách làm 3 hàm, tách để phục vụ luồng Button Draw/Confirm/Redo trên Landing Page (xem
[`docs/landing/button-actions.md`](../landing/button-actions.md)) mà KHÔNG đổi hành vi của nút "Draw now" cũ (trang Draw):

```ts
pickWinner(opts): DrawCandidate   // CHỌN, KHÔNG ghi DB
commitDraw(candidate, sessionId)   // ghi DB thật (INSERT draw_results + UPDATE prizes.remaining)
drawOne(opts) { return commitDraw(pickWinner(opts), opts.sessionId); }  // hành vi CŨ, không đổi
```

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
