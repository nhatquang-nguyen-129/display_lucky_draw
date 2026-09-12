# Save / Discard / lưu trữ & thêm component mới

## Save / Discard / lưu trữ

`config` coi là "dirty" khi khác bản JSON đã Save gần nhất. Nút **Save** ghi xuống
`sessions.landing_config` qua `window.api.sessions.updateLandingConfig`; **Discard** hỏi xác nhận
rồi khôi phục nguyên bản JSON đã Save. Đóng cửa sổ khi còn dirty bị chặn bằng hộp thoại cảnh báo
native (Electron `BrowserWindow` `close` event).

Không có hệ thống migration hình thức cho `landing_config` — `parseLandingConfig()` chỉ kiểm tra
`version === 1` + `components` là mảng + có `canvas`, sai bất kỳ điều nào thì fallback thẳng về
`DEFAULT_LANDING_CONFIG` (rỗng) thay vì cố gắng chuyển đổi shape cũ. Component có `type` không còn
tồn tại trong `COMPONENT_REGISTRY` (vd landing lưu từ trước khi 1 loại component bị xoá khỏi app) bị
lọc bỏ ngay khi load ở cả 3 nơi đọc config (Builder/Present Mode/`LandingPage.tsx`) — xem
[README.md](./README.md) mục 1. Field mới thêm vào 1 loại component theo thời gian được xử lý ad hoc
ở cấp type/view/panel (optional field + fallback), không qua 1 cơ chế version-bump chung nào.

**Lưu ý quan trọng — `landing_config` KHÔNG phải nơi duy nhất bị đổi khi vận hành trang**: action
Confirm/Reset của Button ghi thẳng vào bảng `draw_results`/`prizes.remaining`, ngoài phạm vi JSON
này và KHÔNG bị Discard hoàn tác — xem chi tiết [button-actions.md](./button-actions.md).

## Thêm 1 loại component mới

Xem checklist đầy đủ (4 bước) ở đầu `src/lib/landing/types.ts`:

1. Thêm type + interface (`XxxProps`/`XxxComponent`) vào union `LandingComponent`.
2. Thêm `src/components/landing/views/XxxView.tsx` — chỉ render, nhận `props` + `LandingData`.
3. Thêm `src/components/landing/panels/XxxPanel.tsx` — form cấu hình trong Properties Panel (xem
   [properties-panel.md](./properties-panel.md)).
4. Đăng ký trong `componentRegistry.ts` (label, category cho Palette) — chỗ DUY NHẤT "nối dây" loại
   mới vào Palette (kéo-thả) + Canvas (tạo instance mặc định khi thả).

Nếu component mới có animation/hiệu ứng thật (không chỉ static render), đọc thêm ranh giới
`interactive` ở [present-mode.md](./present-mode.md) và các tier kỹ thuật ở [effects.md](./effects.md)
trước khi chọn cách dựng animation.
