# Roadmap — hướng mở rộng đã đề cập nhưng chưa làm

- Nhiều template Lucky Wheel hơn (`LuckyWheelTemplate` union hiện có `"wheel" | "digitRoller"`, kiến trúc đã sẵn sàng để thêm không đụng code cũ — xem [`docs/landing/lucky-wheel.md`](../landing/lucky-wheel.md)).
- Chuỗi trigger nhiều bước (trigger A tự bắn trigger B) — hiện `EffectReaction` chỉ phản ứng trực tiếp theo 1 trong 3 action Button, chưa hỗ trợ trigger nối trigger (xem [`docs/landing/reactions.md`](../landing/reactions.md)).
- Portable app mang theo dữ liệu (Windows lẫn macOS) — bản portable lưu `lucky-draw.db` cạnh app (Windows qua `PORTABLE_EXECUTABLE_DIR`, macOS tự dò thư mục chứa `.app` bundle + test quyền ghi) thay vì thư mục hồ sơ hệ điều hành, cầm theo 1 USB là có sẵn app + participant/prize/landing, kết quả quay ghi ngược vào USB. Thiết kế đã chốt: [`docs/deploy/portable-app.md`](../deploy/portable-app.md).
- Thêm nhiều "knob" hiệu ứng ngoài dim/scale/glow (theo đúng tinh thần "bộ knob cố định nhỏ" đang áp dụng, không phải editor keyframe tự do).
