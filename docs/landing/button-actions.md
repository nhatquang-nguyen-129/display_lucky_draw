# Button — action cố định

> Code trong `src/lib/landing/types.ts`, `src/components/landing/LandingRenderer.tsx`, và
> `src/components/landing/views/ButtonView.tsx` trỏ thẳng tới file này (comment "xem
> docs/landing/button-actions.md") khi nhắc tới việc Confirm/Reset ghi dữ liệu thật — giữ nguyên tên
> file này nếu tách/đổi tên tài liệu sau này, hoặc cập nhật lại các comment đó cho khớp.

Button KHÔNG có tín hiệu/wiring nào — chọn thẳng 1 **action** cố định trong dropdown của
`ButtonPanel.tsx`, bấm là chạy NGAY action đó (`ButtonView.tsx` gọi thẳng 1 hàm của
`DrawSequenceActions`, xem `useDrawSequence.ts`). **Mỗi action (trừ "None") chỉ cho phép ĐÚNG 1
Button/trang** — action nào đã bị 1 Button khác chiếm sẽ bị khoá trong dropdown (hiện popup nhỏ báo
tên Button đang giữ nó khi hover), tránh 2 nút cùng "Draw" gây nhầm lẫn vận hành. Dropdown Action tự
dựng bằng div/button (không dùng `<select>` gốc) vì `<select>` không cho chèn tooltip riêng vào từng
option — xem `usedActionOwners` (tính ở `PropertiesPanel.tsx`, đọc `config.components`) trong
`ButtonPanel.tsx`. "None" không giới hạn — nhiều Button chưa cấu hình gì vẫn hợp lệ:

> ⚠️ **Nút toolbar "Discard" (huỷ thay đổi chưa Save) là khái niệm HOÀN TOÀN KHÁC** — không liên quan
> gì tới Button action ở đây. Bảng dưới không còn action nào tên "Discard" (xem ghi chú action
> **Draw**) nên không còn nguy cơ nhầm 2 thứ này với nhau nữa.

| Action | Gọi hàm | Ghi gì | Ghi chú |
|---|---|---|---|
| **None** | — | — | Mặc định, chưa cấu hình |
| **Draw** | Đang có candidate CHỜ CONFIRM (`sequence.isPending`) → `sequence.redo()`, ngược lại → `sequence.pick()` | Không ghi DB (chỉ SELECT) | 1 nút DUY NHẤT vừa Draw vừa "Redraw/Discard" — bấm lần đầu chọn candidate mới; bấm tiếp trong lúc candidate đó CHƯA Confirm thì rút lại, chọn lại đúng giải đó cho người khác |
| **Confirm** | `sequence.confirm()` | `INSERT draw_results` + `UPDATE prizes.remaining` | Ghi DB thật, không hoàn tác qua nút Discard |
| **Reset** | `sequence.resetSession()` | `DELETE` toàn bộ `draw_results` của session | Không hoàn tác — xoá hết kết quả đã Confirm |
| **Scoreboard** | `sequence.toggleScoreboard()` | Không ghi gì | Bật/tắt popup Scoreboard giữa màn hình |
| **Open Link** | Đọc `getParticipantField` + `window.api.shell.openExternal` | Không ghi gì | Cần chọn thêm **URL field** — mở URL của winner GẦN NHẤT, no-op im lặng nếu chưa có winner/field rỗng |

**Chi tiết Open Link**: URL đọc từ 1 cột optional (`extra_data`) đã gán Loại dữ liệu "url" ở Data
Editor (xem [`docs/participants/column-mapping.md`](../participants/column-mapping.md)), của CHÍNH
participant vừa trúng (`sequence.candidate`) — qua `getParticipantExtraField()`. Mở bằng
`shell.openExternal()` (main process, chỉ chấp nhận `http(s)://` để tránh mở nhầm scheme lạ) — KHÔNG
dùng `window.open` (bị chặn dưới `contextIsolation: true`).

> **⚠️ Quan trọng — Confirm và Reset là 2 action DUY NHẤT ghi dữ liệu THẬT, VĨNH VIỄN, ngoài phạm vi
> `landing_config`.**
>
> Mọi thứ khác trên trang (Text, Lucky Wheel, styling của Button...) — toàn bộ "trạng thái" chỉ nằm
> trong khối JSON `landing_config` (xem [config-lifecycle.md](./config-lifecycle.md)). Sửa gì, kéo
> gì, xoá gì ở Builder cũng chỉ đổi khối JSON đó — bấm **nút Discard** ở toolbar là quay lại y nguyên
> bản đã Save gần nhất, không có gì mất thật.
>
> **Confirm thì khác**: gọi thẳng `window.api.draw.commit()` → ghi **1 dòng thật vào bảng
> `draw_results`** và **trừ `prizes.remaining`** trong SQLite — trong 1 transaction, ở
> `commitDraw()` (`electron/drawEngine.ts`). Đây là ghi DB thật, **nút Discard ở toolbar không hề
> đụng tới và không thể hoàn tác** (cách duy nhất huỷ là action **Reset** — xoá TOÀN BỘ kết quả của
> cả session, không phải riêng 1 lượt). `draw_results`/`prizes.remaining` chính là dữ liệu mà Data
> Editor và màn hình quản lý Prize đọc/hiển thị.
>
> `Draw` "nhẹ" hơn: cả `sequence.pick()` lẫn `sequence.redo()` (2 hàm cùng đứng sau action **Draw**,
> xem bảng trên) đều KHÔNG ghi DB (chỉ SELECT chọn ứng viên), nhưng ứng viên đang chờ đó (`candidate`)
> đã được "độn" ngay vào `results[0]` (1 dòng giả, xem `useDrawSequence.ts`'s `effectiveData`) —
> nghĩa là MỌI component đọc dữ liệu (Winner, Lucky Wheel...) đã thấy "có kết quả" NGAY khi Draw
> chạy, **trước khi** Confirm ghi DB thật. Nếu Draw chạy nhưng Confirm không bao giờ chạy theo sau,
> ứng viên đó vẫn hiện trên màn hình nhưng KHÔNG BAO GIỜ thật sự tồn tại trong `draw_results`.
>
> `Open Link` không ghi gì vào DB, nhưng vẫn có hệ quả ngoài `landing_config`: mở 1 trình duyệt
> ngoài thật sự trên máy đang chạy Present Mode.

Lucky Wheel KHÔNG cần Button nào ra lệnh — nó tự phát hiện `results[0].id` vừa đổi (candidate mới,
dù là lượt Draw đầu hay 1 lượt "quay lại" từ chính action Draw đó — xem trên) và tự bắt đầu quay (xem
`WheelTemplate.tsx`/`DigitRollerTemplate.tsx`), dừng đúng lúc animation THẬT SỰ kết thúc, không phải
đoán 1 delay cố định.

## 3 chế độ Draw (Single / Multiple / Quick)

**Nút Draw có thêm 1 mũi tên dropdown (▾) cạnh nó** (`DrawMenu` trong `ButtonView.tsx`, chỉ hiện ở
Present Mode thật) — dropdown này là 1 BỘ CHỌN CHẾ ĐỘ (kiểu radio, có dấu ✓ cạnh mục đang chọn),
KHÔNG tự chạy draw. Chọn xong, người vận hành phải tự bấm nút Draw CHÍNH để thật sự tiến hành quay
theo đúng chế độ đã ARM (`sequence.drawMode`/`drawCount`, chạy qua `sequence.runDraw()` — xem
`runAction`'s case `"draw"` trong `ButtonView.tsx`):

| Chế độ | Chọn trong dropdown | Khi bấm nút Draw chính |
|---|---|---|
| **Single Draw** | Set thẳng, không hỏi gì | Y hệt hành vi Draw gốc: đang có candidate chờ Confirm thì `redo()`, chưa có gì thì `pick()` |
| **Multiple Draw** | Hỏi số lượng N (≤ remaining của giải đang chọn) qua popup (`DrawModeCountPopup.tsx`) | Lặp lại ĐÚNG quy trình Single Draw (pick → chờ Wheel hiện xong → tự Confirm) N lần liên tiếp, nghỉ ngắn giữa mỗi người |
| **Quick Draw** | Hỏi số lượng N (≤ remaining của giải đang chọn) qua cùng 1 popup | Quay + Confirm ĐÚNG N người NGAY LẬP TỨC (không nghỉ giữa các lượt), tự mở Scoreboard khi xong |

Multiple/Quick đều BẮT BUỘC đã chọn 1 giải qua Prize Image (`sequence.selectedPrizeId`)
NGAY TỪ LÚC chọn mục trong dropdown — không phụ thuộc trang có UI chọn giải hay không (khác Single
Draw). `runMultipleDrawInternal`/`runQuickDrawInternal` (`useDrawSequence.ts`) tự gọi thẳng
`window.api.draw.pick`/`commit` (không tái dùng nội bộ `pick()`/`confirm()`), tự re-validate lại
count/remaining MỚI NHẤT ngay lúc bấm Draw (phòng trường hợp đổi từ lúc ARM tới lúc bấm, hoặc đổi
sang giải khác), và giữ `sequence.spinning = true` SUỐT quá trình — tái dùng nguyên vẹn mọi điểm khoá
"gần như mọi chức năng" đã có sẵn cho `spinning` thường, không cần thêm cờ khoá riêng. Trong lúc Quick
Draw đang chạy, Winner hiện `props.quickDrawText` (mặc định "Congratulations!") THAY VÌ tên
người trúng — Quick Draw ra nhiều người cùng lúc nên không có 1 tên "đúng" nào để hiện (xem
`WinnerNameProps.quickDrawText`, `DrawSequenceActions.quickDrawResult`).

## Bug đã sửa: "Button nhìn trong suốt" trong Builder

`ButtonView.tsx` ban đầu dùng `disabled:opacity-40` — vì `disabled` LUÔN true trong Builder (không có `sequence`, xem [present-mode.md](./present-mode.md)), Button luôn hiện mờ 40%, trông như trong suốt. Sửa bằng cách TÁCH 2 khái niệm: "không bấm được vì đang ở Builder" (vẫn hiện FULL độ đậm) khác với "tạm thời không bấm được ở Present Mode thật vì sai phase/busy" (mới thật sự làm mờ) — qua 1 cờ riêng `showFaded = !!sequence && disabled`, không gắn opacity trực tiếp vào thuộc tính HTML `disabled`.
