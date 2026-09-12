# EffectReaction — hệ effect generic gắn theo trigger

## Ý tưởng

Đi kèm với Interactive Buttons ([button-actions.md](./button-actions.md)) là hệ effect "hiệu ứng
phản ứng theo hành động" (nền tối đi khi bấm Quay, ảnh giải thưởng phóng to + phát sáng khi Xác
nhận...) — cho phép người tổ chức sự kiện đặt các nút bấm THẬT lên Landing Page, điều khiển được
toàn bộ chuỗi quay ngay trên màn hình trình chiếu, kèm phản hồi hình ảnh tức thời cho khán giả.

## Cấu trúc dữ liệu

```ts
interface EffectReaction {
  trigger: "draw" | "confirm" | "redo";
  delayMs: number;    // chờ bao lâu sau trigger mới áp
  durationMs: number; // giữ bao lâu rồi tự trả về bình thường; 0 = giữ tới trigger kế tiếp
  dim?: number; scale?: number; glow?: boolean; glowColor?: string;
}
```

BẤT KỲ component nào (và cả canvas background) đều có thể mang mảng `reactions?: EffectReaction[]` — thêm hiệu ứng cho 1 component chỉ là thêm 1 phần tử vào mảng qua `ReactionsEditor.tsx` (dùng chung, không cần code riêng cho từng cặp component/trigger). `useActiveReactions` tính "target nào đang active reaction gì" tại 1 thời điểm dựa vào `lastTrigger.firedAt` — không poll liên tục, chỉ tự re-render đúng vào mốc bắt đầu/kết thúc qua `setTimeout`.

Đây KHÔNG phải hệ tín hiệu tổng quát kiểu Trigger Graph đã bỏ (xem `CLAUDE.md`) — `trigger` chỉ nhận
đúng 3 giá trị cố định (`draw`/`confirm`/`redo`, khớp action Button), không cho nối dây tuỳ ý giữa
các component. Xem thêm nguyên tắc kỹ thuật khi thêm effect mới ở [effects.md](./effects.md).

## Roadmap liên quan

Chuỗi trigger nhiều bước (trigger A tự bắn trigger B) — hiện `EffectReaction` chỉ phản ứng trực tiếp
theo 1 trong 3 action Button, chưa hỗ trợ trigger nối trigger. Xem
[`docs/architecture/roadmap.md`](../architecture/roadmap.md).
