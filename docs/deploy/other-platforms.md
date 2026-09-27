# macOS / Linux (ngoài phạm vi chính)

Người dùng cuối của app này chủ yếu chạy Windows tại sự kiện, nên tài liệu tập trung vào file `.exe`.
Nếu cần bản macOS/Linux, `electron-builder` cũng đóng gói được `zip`/`dmg`/`AppImage` từ cùng 1
codebase — thêm khối `"mac"`/`"linux"` tương ứng vào `build` trong `package.json` rồi build TRÊN ĐÚNG
hệ điều hành đó (cùng lý do ở [README.md](./README.md) mục Prerequisites — native module
`better-sqlite3`).

macOS đã có thiết kế (chưa implement) cho mục "portable mang theo dữ liệu" (config `mac` gợi ý, cách
dò thư mục chứa `.app` bundle, Gatekeeper) — xem [portable-app.md](./portable-app.md#macos-kế-hoạch-chưa-implement). Linux (`AppImage`) chưa
có thiết kế nào, ngoài phạm vi tài liệu hiện tại.
