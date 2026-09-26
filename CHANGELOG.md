# Changelog

Ghi lại các thay đổi đáng chú ý theo từng bản phát hành. Mục mới nhất ở trên cùng.

## [Unreleased] — bản production sắp tới

### Lucky Wheel — ĐÃ CHỐT cho production

Code Lucky Wheel (Wheel Circular + Digit Roller) ở trạng thái này là bản dùng cho production. Từ đây
chỉ sửa bug, không đổi hành vi/giao diện nếu không có yêu cầu rõ ràng.

File liên quan: `src/components/landing/luckyWheelTemplates/` (`WheelTemplate.tsx`,
`DigitRollerTemplate.tsx`), `src/components/landing/panels/LuckyWheelPanel.tsx`,
`LuckyWheelProps` trong `src/lib/landing/types.ts`. Chi tiết kỹ thuật: `docs/landing/lucky-wheel.md`.

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
