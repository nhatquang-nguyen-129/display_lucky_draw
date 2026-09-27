import { useEffect, useState } from "react";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// `<input type="color">` tự vẽ 1 popup màu RIÊNG của Chromium (bánh xe màu + thanh hue + ô hex) —
// KHÔNG phải DOM thường của trang, nên Ctrl/Cmd+V dán hex vào ô hex bên trong popup đó không hoạt
// động (giới hạn của chính Chromium, không sửa được từ code trang web — chỉ gõ tay hoặc dùng
// eyedropper/bánh xe màu mới ăn). Thêm hẳn 1 ô text THẬT ngay cạnh swatch để gõ/dán hex trực tiếp,
// vẫn giữ swatch cho ai muốn chọn nhanh bằng mắt qua bánh xe màu native.
export default function ColorField({
  value,
  onChange,
  className = "h-[26px]",
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);

  // Đồng bộ lại khi value đổi TỪ BÊN NGOÀI (vd Undo/Redo, chọn sang component khác) — không ghi đè
  // lúc đang gõ dở giá trị chưa hợp lệ (state cục bộ `text` giữ nguyên cho tới khi commit).
  useEffect(() => {
    setText(value);
  }, [value]);

  function commit(next: string) {
    setText(next);
    if (HEX_RE.test(next)) onChange(next);
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        type="color"
        className="h-full w-8 shrink-0 rounded border border-base-700 bg-base-800 p-0"
        value={HEX_RE.test(text) ? text : value}
        onChange={(e) => commit(e.target.value)}
      />
      <input
        type="text"
        className="h-full min-w-0 flex-1 rounded border border-base-700 bg-base-800 px-2 text-xs text-base-100 outline-none focus:border-gold-500"
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(HEX_RE.test(text) ? text : value)}
        spellCheck={false}
        placeholder="#RRGGBB"
      />
    </div>
  );
}
