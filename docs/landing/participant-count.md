# Participant Count (`participantCount`) — nhóm Live

Số người tham gia của session, dạng "Nhãn + Số". Mặc định 260×50.

## Properties Panel (`ParticipantCountPanel.tsx`)

Chỉ có **Basic options**:

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Label | `label` | "Participants:" | Để trống thì chỉ hiện số |
| Count | `mode` | total | **Total Participants** = tổng participant; **Not Yet Won (Approximate)** (`remainingEligible`) = chưa xuất hiện trong kết quả quay nào |
| Align | `align` | center | |
| Label text: Font / Font size / Color | `labelFontFamily`/`labelFontSize`/`labelColor` | Sans / 20 / `#FFFFFF` | Font: Sans (default) / Serif / Monospace |
| Count text: Font / Font size / Color | `countFontFamily`/`countFontSize`/`countColor` | Sans / 24 / `#FFCA2D` | |
| Background | `backgroundType` | none | None (Transparent) / Solid Color / Image |
| Background color | `backgroundColor` | `#0B0B10` | Khi Color |
| Image + Fit | `backgroundImageDataUrl`/`backgroundImageFit` | — / cover | Khi Image |
| Corner radius | `borderRadius` | 8 | Áp cho nền Color lẫn Image |

## Hành vi

- Đếm trên `data.participants` (danh sách participant đang active của session, poll 2s) — cập nhật
  sống khi sửa ở Data Editor.
- **Not Yet Won là con số GẦN ĐÚNG**: participant không có trong bất kỳ `results` nào — không tái
  tạo đầy đủ luật loại trừ theo từng giải của Draw Engine, chỉ để hiển thị. Ở Present Mode, `results`
  gồm cả dòng candidate chưa Confirm (`pending-*`), nên người vừa được quay đã bị trừ ngay.
- Nền chỉ thêm đệm ngang 12px khi thật sự có nền, để không dịch chữ so với landing cũ.
- **Tương thích ngược**: bản đầu gộp 1 `fontSize`/`color` cho cả nhãn lẫn số; đã tách thành 2 bộ
  style. JSON cũ vẫn còn 2 field đó — view/panel đọc làm fallback qua `as any`, không cần migration.

## File liên quan

`src/lib/landing/types.ts` (`ParticipantCountProps`), `views/ParticipantCountView.tsx`,
`panels/ParticipantCountPanel.tsx`.
