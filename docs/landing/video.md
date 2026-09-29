# Video (`video`) — nhóm Basic

Video clip trên landing (intro, clip nhà tài trợ, hiệu ứng nền động...). Mặc định 640×360. Tự phát
trong Presentation, hoặc Play/Pause/Stop theo quy trình quay.

## Lưu trữ

Video KHÔNG lưu base64 trong `landing_config` như [Image](./image.md) (vài trăm MB, mỗi lần Save gửi lại
nguyên JSON). File được lưu thành BLOB trong bảng `media` của **chính file session** (xem
[database-schema.md](../architecture/database-schema.md#schema-trong-mỗi-file)) — copy 1 file `.db` sang
máy khác vẫn mang theo đủ video. `landing_config` chỉ giữ `mediaId`.

- **Import**: nút **Choose video…** gọi IPC `media:importVideo` — main process tự mở dialog, đọc file bằng
  `fs`, ghi BLOB, trả `{ mediaId, fileName, size }`. Nhận `.mp4/.m4v/.mov/.webm/.ogv`, tối đa 500 MB.
  `.mov` chỉ phát được nếu codec là H.264 (ProRes... Chromium không phát).
- **Phát**: renderer dùng URL `ldmedia://<sessionId>/<mediaId>` (scheme riêng, `electron/media.ts`). Lần
  đầu phát, BLOB được xả ra file cache `%TEMP%/lucky-draw-media/` rồi phục vụ theo HTTP Range (thẻ
  `<video>` cần Range để tua/đọc từng đoạn). Import lại = id mới nên cache không cần làm mới.
- **Dọn dẹp**: đổi/xoá video trong Builder để lại dòng `media` mồ côi. Mỗi lần **mở** cửa sổ Builder,
  `purgeUnusedMedia` xoá các dòng mà `landing_config` đã lưu không còn nhắc tới, rồi `VACUUM` để file
  `.db` nhỏ lại. Không dọn lúc Save — Undo sau khi Save có thể trỏ lại video cũ.
- `sessionId` đến View/Panel qua `LandingSessionContext` (cung cấp ở `PresentMode.tsx`,
  `LandingBuilderWindow.tsx`, `LandingPage.tsx`).

## Properties Panel (`VideoPanel.tsx`)

**Basic options**

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Video | `mediaId`, `fileName` | trống | Chưa có video → khung hiện "No video" |
| Fit | `fit` | contain | cover / contain / stretch (`object-fit: fill`) |
| Border radius | `borderRadius` | 0 | px |
| Loop | `loop` | bật | Tắt → phát hết thì đứng ở khung cuối |
| Muted | `muted` | bật | Bỏ tick để phát cả tiếng qua loa sự kiện |

**Interactions with Draw** — cùng bố cục `DrawCycleFields` (Prize + 3 mốc Idle/Draw/Redraw, cùng quy
tắc "không trùng giá trị thật gần nhất phía trước"), nhưng Appearance là trạng thái **phát**:

| Appearance | Hành vi |
|---|---|
| Play | Phát tiếp từ vị trí đang đứng (đã hết + không Loop → phát lại từ đầu) |
| Pause | Dừng tại khung hình hiện tại |
| Stop | Dừng VÀ tua về khung hình đầu tiên (vẫn hiện khung đó, không ẩn video) |

Mỗi mốc chỉ có **Delay**, không có Effect (đổi trạng thái phát là tức thì). Không tick **Trigger with
Draw** = video tự phát ngay khi mở Presentation. Mặc định khi bật: Idle = Stop, Draw = Play, Redraw = Stop
(→ mỗi lượt quay lại, video phát lại từ đầu sau khoảng đệm 1s). Model đầy đủ:
[presentation.md mục 4](./presentation.md#4-interactions-with-draw--model-idledrawredraw).

## Hành vi

- Builder canvas luôn đứng yên ở khung hình đầu (Stop) để còn chọn/kéo.
- Idle áp ngay lúc mở Presentation (không Delay); Delay của Idle chỉ áp khi Reset.
- Không có nền mờ phía sau khi đã có video (giống Image).

## File liên quan

`src/lib/landing/types.ts` (`VideoProps`, `VideoCycleConfig`), `views/VideoView.tsx`,
`panels/VideoPanel.tsx`, `views/drawRevealHooks.ts` (`useVideoCycleState`),
`LandingSessionContext.ts`, `electron/media.ts`, `electron/db.ts` (bảng `media`).
