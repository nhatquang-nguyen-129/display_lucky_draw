# Changelog

Ghi lại các thay đổi đáng chú ý theo từng bản phát hành. Mục mới nhất ở trên cùng.

## [Unreleased]

### Component Video (nhóm Basic)

Chi tiết: `docs/landing/video.md`.

- Video trên landing (MP4/WebM/MOV, tối đa 500 MB): Fit, Border radius, Loop, Muted (mặc định tắt
  tiếng). Không bật "Trigger with Draw" thì tự phát trong Presentation.
- "Interactions with Draw" cùng model Idle/Draw/Redraw như Image nhưng Appearance là **Play / Pause /
  Stop** (Stop = về khung hình đầu, vẫn hiện), mỗi mốc chỉ có Delay.
- Lưu trữ: BLOB trong bảng mới `media` của chính file session (migration additive, file cũ chỉ được
  thêm bảng) — copy 1 file `.db` vẫn mang đủ video. Phát qua scheme `ldmedia://` có hỗ trợ HTTP Range.
  Video không còn dùng tự dọn (+ `VACUUM`) mỗi lần mở Builder.

## [1.1.2] — 2026-09-29

### Sửa lỗi Image hiện khung xám quanh ảnh PNG trong suốt

Chi tiết: `src/components/landing/views/ImageView.tsx`.

- Component **Image** luôn phủ nền `bg-base-800/40` sau ảnh kể cả khi ĐÃ có ảnh — PNG tách nền (vd
  Podium) lộ ra thành 1 khung chữ nhật xám mờ, cả trong Builder lẫn Present Mode.
- Sửa: nền mờ chỉ còn hiện khi CHƯA có ảnh (placeholder "No image"), đồng nhất với Prize Image
  (`PrizeImageView.tsx`).

## [1.1.1] — 2026-09-29

### Sửa lỗi Normalize Phone xoá nhầm chữ "o" thay vì đổi thành số "0"

Chi tiết: `src/lib/dataEditor/transforms.ts` (`normalizePhoneResult`).

- **Bug quan trọng**: chữ `o`/`O` (gõ nhầm rất phổ biến thay cho số `0`, hình dạng giống hệt) bị lệnh
  **Normalize Phone** XOÁ THẲNG như mọi ký tự không phải số khác, thay vì sửa thành `0` — biến 1 số
  điện thoại 10 chữ số hợp lệ (vd `098760o123`) thành 9 chữ số SAI định dạng (`098760123`) sau khi
  "chuẩn hoá", ngược hẳn mục đích của tính năng.
- Sửa: đổi `o`/`O` → `0` TRƯỚC khi xoá ký tự không phải số — `098760o123` giờ ra đúng `0987600123`
  (10 số, hợp lệ). Đã kiểm tra lại qua UI thật (Data Editor → Normalize Phone), không chỉ đơn vị hàm.

## [1.1.0] — 2026-09-29

### Close / Move to trash / Open / Restore — tách rõ 4 hành động trên session

Chi tiết: `docs/architecture/database-schema.md` mục "Lưu trữ theo session".

- **Close** (nút × trên tab): giờ CHỈ ẩn tab khỏi thanh tab — file `.db` KHÔNG di chuyển đi đâu, vẫn
  nằm nguyên trong `data/` (cột `sessions.closed` mới, migration additive). Không còn confirm vì hoàn
  toàn vô hại/dễ hoàn tác.
- **Move to trash** (đổi tên từ "Delete", menu chuột phải/Option+click trên tab): chuyển file vào
  `data/.trash/` như trước — vẫn có confirm vì khó hoàn tác hơn.
- **Open** (thay chỗ nút "Data folder" cũ ở thanh tab): mở hộp thoại chọn 1 file `.db` bất kỳ (mặc
  định mở ngay `data/`) — mở lại 1 session đang Close, khôi phục 1 file đang ở `.trash/`, hoặc nạp 1
  session từ ngoài `data/` (USB, backup máy khác — copy vào `data/`, giữ nguyên bản gốc; trùng id với
  session có sẵn thì tự hiện đúng hộp thoại conflict đã có sẵn).
- **Restore** (đổi tên từ "Trash"): hộp thoại liệt kê session trong `data/.trash/`, chọn nhiều bằng
  checkbox, 3 nút **Cancel / Restore / Delete** — Delete ở đây là xoá **vĩnh viễn** khỏi `data/.trash/`
  (không còn đường lấy lại, có confirm riêng), khác hẳn Restore.
- Sửa bug tạo trùng session: ô nhập tên tab mới nghe cả `onKeyDown` (Enter) lẫn `onBlur`, có thể cả 2
  cùng bắn gần như đồng thời và tạo 2 session trùng tên trước khi state kịp reset — chặn bằng ref-guard.

### Session Lock — khoá session sau khi quay xong

Chi tiết: `docs/architecture/session-lock.md`.

- Thêm: khoá/mở khoá từng session (chuột phải, hoặc Option + click trên macOS, vào tab) để tránh nhầm
  lẫn chỉnh sửa sau khi đã có kết quả cuối — KHÔNG phải bảo mật, không có password, không có khôi phục.
- Session khoá: chặn hẳn mở Data Editor/Presentation/Builder, mọi thao tác Add/Edit/Delete/Import trên
  Participant/Prize, và cả đổi tên/đóng tab (Dashboard vẫn xem được bình thường — chỉ-xem thật sự).
- Từ chối khoá nếu session đó đang có cửa sổ Data Editor/Landing Builder/Presentation mở sẵn — báo rõ
  cửa sổ nào cần đóng trước.
- Mở khoá bắt buộc giữ nút 3 giây (tránh 1 cú bấm nhầm gỡ khoá).
- Chặn thật nằm ở tầng IPC (`assertSessionUnlocked()`, `electron/main.ts`), không chỉ ẩn nút ở
  renderer — gọi thẳng API bị khoá qua DevTools console vẫn bị từ chối.
- Cột mới `sessions.locked` (migration additive, không ảnh hưởng session cũ — mặc định chưa khoá).

### Confirm/Reset trên Landing Page — giữ 3 giây ngay trên nút, bỏ popup xác nhận

- Confirm và Reset không còn hiện popup hỏi lại — giữ nút 3 giây là đủ (thanh tối phủ dần lên nút,
  nhãn đổi thành "Hold 3s to confirm/reset"; giữ đủ 3s thì nút xanh "✓ Confirmed"/"✓ Reset" 1.5s, thả
  sớm quay lại nhãn cũ ngay). Bấm/Enter/Space thường không có tác dụng. Popup duy nhất còn lại là cảnh
  báo Redraw (bấm Draw khi còn 1 kết quả chưa Confirm).

## [1.0.1] — 2026-09-28

### Luật trùng giải — chỉ còn ở cấp giải, sửa "Allow duplicate" không có tác dụng

Chi tiết: `docs/architecture/draw-engine.md` mục "Luật trùng lặp — CHỈ ở cấp giải".

- Sửa: **Allow duplicate with itself** + **Max wins per person** giờ thật sự cho 1 người trúng lại chính
  giải đó tới Max lần; **Allow duplicate with other prizes** cho người đã trúng giải khác trúng tiếp giải
  này. Trước đây cờ session `exclude_previous_winners` (luôn bật, không có UI) loại mọi người đã trúng,
  và kiểm tra "other prizes" đếm nhầm cả chính giải đó.
- Không tick cả 2 (mặc định giải mới) = mỗi người 1 giải, 1 lần. Mặc định "other prizes" đổi thành tắt.
- Session cũ: migration 1 lần (`user_version` 0 → 1) tắt 2 tuỳ chọn trên các giải của session đang bật
  cờ cũ → kết quả quay y như trước. Sửa lại hint trong Prize form cho đúng nghĩa.

### Lưu trữ theo session — mỗi session là 1 file

Chi tiết: `docs/architecture/database-schema.md` mục "Lưu trữ theo session".

- Mỗi session (tab) là 1 file SQLite `<tên-session>__<8 ký tự mã>.db` trong `data/` (bản portable:
  cạnh app; dev/cài đặt: `<userData>/data/`). Copy 1 file sang `data/` máy khác là có y nguyên session
  đó (participants, prizes, landing, lịch sử quay). Định danh theo mã bên trong file — trùng tên
  session không sao.
- File dùng `journal_mode = DELETE` (bỏ WAL): không có `-wal`, copy file lúc nào cũng đủ dữ liệu.
- Tự tách `lucky-draw.db` kiểu cũ (và file nhiều session bất kỳ trong `data/`) thành từng file lúc khởi
  động; file gốc giữ lại thành `*.migrated-<thời điểm>.bak`.
- Có ≥ 2 file của cùng 1 session: hộp thoại **"Different copies of the same session"** hiện ngay khi mở
  app — gợi ý bản sửa gần nhất, người dùng tự chọn; bản không chọn vào `data/.trash/`.
- Copy file vào `data/` lúc app đang mở: quay lại cửa sổ app là tab mới tự hiện. Nút **Data folder**
  ở góc phải thanh tab mở thư mục `data/`.
- Xoá tab = chuyển file vào `data/.trash/` thay vì xoá hẳn dữ liệu.
- IPC: bỏ kết nối DB chung, dùng `getDb(sessionId)`; `participants:update/delete/bulkDelete/reorder`,
  `prizes:update/delete` nhận thêm `sessionId`; thêm `sessions:conflicts`, `sessions:resolveConflict`,
  `sessions:openDataFolder`.

### macOS — bản thư mục (portable), đã test trên Mac thật — ký ad-hoc mặc định KHÔNG chạy được

Chi tiết + hướng dẫn build/test: `docs/deploy/portable.md` (mục macOS, đặc biệt "Ký số"), `docs/deploy/installer.md`.

- `npm run package` trên Mac ra `Lucky Draw Studio-<version>-mac.zip` (universal: Intel + chip M):
  thư mục mẹ `Lucky Draw Studio/` chứa `Lucky Draw Studio.app`, dữ liệu ở `data/` cạnh `.app`
  (không ghi vào trong bundle). Kéo riêng `.app` vào Applications thì dùng
  `~/Library/Application Support/lucky-draw-app/` như app cài đặt.
- **Test trên Mac thật (MacBook Pro M-series, macOS 26.6.2) xác nhận**: ký ad-hoc mặc định
  (`identity: null`) bị macOS **AMFI chặn cứng lúc chạy** (`Code=-423`), không phải chỉ cảnh báo
  Gatekeeper bấm "Run Anyway" được như dự tính ban đầu — app tự thoát trong 1-2s, không cửa sổ,
  không dialog.
- **Cách chạy được, MIỄN PHÍ** (không cần Apple Developer ID $99/năm): ký lại `.app` bằng 1 chứng chỉ
  "Apple Development" tạo qua Xcode + Apple ID thường, cộng thêm cài chứng chỉ trung gian WWDR đúng
  thế hệ (G3) — **chỉ có tác dụng trên đúng máy Mac đã tạo chứng chỉ đó**. Chi tiết đầy đủ + cách xử
  lý tạm thời khi chuyển sang máy Mac khác: `docs/deploy/portable.md` mục "Ký số" và "Mở trên Mac khác
  chưa có chứng chỉ".
- Muốn 1 bản chạy thẳng trên MỌI Mac tại venue mà không cần cấu hình gì trước vẫn cần Apple Developer
  ID + notarization thật sự — chưa làm.
- `sudo spctl --add` (từng dự tính là phương án tạm) đã bị Apple khai tử trên macOS hiện tại, loại
  khỏi danh sách lựa chọn.
- App báo lỗi rồi thoát khi bị macOS App Translocation (app còn cờ quarantine) — kèm lệnh `xattr`
  để sửa; báo rõ USB NTFS là chỉ-đọc trên Mac.
- Bản đóng gói trên Mac thoát hẳn khi đóng cửa sổ cuối cùng (giống Windows) để DB được đóng ngay.
  Bản dev giữ hành vi Mac mặc định.
- Checklist chức năng đầy đủ qua UI (tạo session, import, quay, landing, Present Mode…) **chưa test
  bằng tay** — mới xác nhận app khởi động và giữ tiến trình ổn định.

## [1.0.0] — 2026-09-27

Bản production đầu tiên.

### Đóng gói & phân phối (Windows)

Chi tiết: `docs/deploy/` (đặc biệt `portable.md`, `installer.md`, `build.md`).

- **Bản thư mục (portable) mang theo dữ liệu**: `npm run package` ra
  `Lucky Draw Studio-<version>-win.zip`. Giải nén được đúng 1 thư mục `Lucky Draw Studio\`, database
  nằm ở `data\lucky-draw.db` ngay trong thư mục đó. Copy nguyên thư mục sang máy khác là mang theo
  toàn bộ participant/prize/landing/kết quả quay.
  - Zip có sẵn thư mục mẹ (tự nén bằng `electron/make-portable-zip.mjs` qua `tar.exe` của Windows,
    thay target `zip` của electron-builder vốn bung file lẻ), bỏ qua `data\` của `win-unpacked`.
  - App báo lỗi rồi thoát nếu chạy từ thư mục tạm (mở exe ngay trong zip chưa giải nén) hoặc thư mục
    `data\` không ghi được — không âm thầm lưu dữ liệu vào chỗ khác.
- **Bỏ file `.exe` portable 1-file**: tự giải nén ra `%TEMP%` mỗi lần chạy và xoá khi tắt, nên
  không giữ được dữ liệu cạnh app.
- **Installer (Setup.exe)** giữ nguyên, dữ liệu vẫn ở `%APPDATA%\lucky-draw-app\`.
- **Chặn mở 2 app cùng lúc** (bản đóng gói): mở lần 2 chỉ đưa cửa sổ đang chạy lên trước, không có 2
  process cùng ghi 1 file DB.
- **Đóng DB khi thoát** (bản đóng gói) để dữ liệu `-wal` gộp hết vào `lucky-draw.db`.
- **Sửa** `npm run build` không tạo `dist-electron/package.json` (`{"type":"commonjs"}`) — build từ
  bản clone sạch sẽ ra app crash ngay khi mở.
- Bản dev (`npm run electron:dev`) không đổi gì: DB vẫn ở `%APPDATA%\lucky-draw-app\`.
- Tài liệu: sửa đường dẫn DB sai (`Lucky Draw Studio\` → `lucky-draw-app\`), thêm troubleshooting lỗi
  symlink `winCodeSign` khi build trên Windows không bật Developer Mode.

### Lucky Wheel — ĐÃ CHỐT cho production

Code Lucky Wheel (Wheel Circular + Digit Roller) ở trạng thái này là bản dùng cho production. Từ đây
chỉ sửa bug, không đổi hành vi/giao diện nếu không có yêu cầu rõ ràng.

File liên quan: `src/components/landing/luckyWheelTemplates/` (`WheelTemplate.tsx`,
`DigitRollerTemplate.tsx`), `src/components/landing/panels/LuckyWheelPanel.tsx`,
`LuckyWheelProps` trong `src/lib/landing/types.ts`. Chi tiết kỹ thuật: `docs/landing/components/lucky-wheel.md`.

**Hành vi đã chốt**

- 2 template: **Wheel Circular** (vòng tròn chia segment theo participant) và **Digit Roller** (ô ký
  tự kiểu máy quay số, Style **Flicker** hoặc **Reel**).
- Luôn dừng ở người trúng thật do Draw Engine trả về (`results[0]`), chỉ tự quay với kết quả live của
  lượt Draw hiện tại, không quay lại tới winner cũ đọc từ DB.
- Trường hiển thị (Source) resolve qua Data Type của cột, không đọc cứng `participant.name`/`phone`.
- Quick Draw: Digit Roller đứng yên ở `-` trong lúc chạy, xong thì quay đúng 1 lượt và chốt ở `-`.
- Properties Panel, mục **Spin**: chỉ còn **Spin duration** và **Style** (Style chỉ có ở Digit
  Roller). Component mới tạo luôn dùng dừng lần lượt từng ô (`sequential`) + hiệu ứng `pop`.
- Tốc độ quay: mọi template luôn **giảm tốc đều** tới lúc dừng.
  - Digit Roller (cả Flicker lẫn Reel) dùng chung 1 mô hình 3 pha: tăng tốc (~8%) → chạy đều → giảm
    tốc đều (~28% cuối) của riêng từng ô. Flicker đổi ký tự khoảng mỗi 40ms lúc chạy đều.
  - Wheel Circular chậm dần đều từ lúc bắt đầu tới lúc dừng, không dừng khựng.

**Thay đổi trong đợt chốt này**

- **Bỏ** dropdown **Spin style** (Linear / Fast Start and Slow Stop / Smooth Start and Stop): đã thử
  các kiểu, khác biệt khi xem thật không đáng kể, chỉ giữ giảm tốc đều. Landing cũ còn lưu
  `spinEasing` được bỏ qua, không cần migration.
- **Sửa** Digit Roller Flicker khi dừng lần lượt từng ô: trước đây chỉ ô đầu tiên giảm tốc, các ô
  sau chạy nhanh rồi dừng đột ngột. Giờ ô nào cũng có đủ pha giảm tốc riêng, giống Reel.
