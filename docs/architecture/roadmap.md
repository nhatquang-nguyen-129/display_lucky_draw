# Roadmap — hướng mở rộng đã đề cập nhưng chưa làm

- Nhiều template Lucky Wheel hơn (`LuckyWheelTemplate` union hiện có `"wheel" | "digitRoller"`, kiến trúc đã sẵn sàng để thêm không đụng code cũ — xem [`docs/landing/lucky-wheel.md`](../landing/lucky-wheel.md)).
- Chuỗi trigger nhiều bước (trigger A tự bắn trigger B) — hiện `EffectReaction` chỉ phản ứng trực tiếp theo 1 trong 3 action Button, chưa hỗ trợ trigger nối trigger (xem [`docs/landing/reactions.md`](../landing/reactions.md)).
- Portable app mang theo dữ liệu cho macOS — Windows ĐÃ XONG (bản thư mục/zip lưu `data\lucky-draw.db` cạnh exe); macOS còn lại: tự dò thư mục chứa `.app` bundle + test quyền ghi, thêm target `mac` zip universal. Thiết kế: [`docs/deploy/portable-app.md`](../deploy/portable-app.md#macos-kế-hoạch-chưa-implement).
- Thêm nhiều "knob" hiệu ứng ngoài dim/scale/glow (theo đúng tinh thần "bộ knob cố định nhỏ" đang áp dụng, không phải editor keyframe tự do).
