import { ReactNode } from "react";

// "default" (đen) — số liệu GỐC/TỔNG (Participants original, Total prizes, Total draws).
// "muted" — 1 màu xanh nhạt DÙNG CHUNG cho mọi số liệu "phái sinh" (current/awarded/confirmed) — cố ý
// dùng alpha (`/70`) thay vì `teal-400` đặc để giảm tương phản so với chữ đen, không "nhảy mắt" khi
// đặt cạnh số liệu gốc màu đen trên nền trắng.
const accentMap = {
  default: "text-base-100",
  muted: "text-teal-500/70",
};

// 1 thanh chỉ số trên Dashboard — tiêu đề nhỏ + lưới ô CỐ ĐỊNH tối đa 6 cột (2 cột màn hẹp, 3 cột màn
// vừa, 6 cột màn rộng — dàn thành đúng 1 hàng). Các ô ngăn nhau bằng khe `gap-px` lộ nền container
// (bg-base-800) thành đường kẻ mảnh, đều mọi hướng và không lệch khi xuống hàng. Lưu ý: nếu số ô
// KHÔNG chia hết cho số cột ở 1 breakpoint, ô trống cuối hàng sẽ lộ mảng nền kẻ — giữ đúng bội số cột
// (hiện tại: 6 ô, chia hết cho cả 2/3/6).
export function StatSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-base-400">{title}</h2>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-base-800 bg-base-800 sm:grid-cols-3 lg:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

export function Stat({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string | number;
  accent?: keyof typeof accentMap;
}) {
  return (
    <div className="min-w-0 bg-base-900 px-4 py-4 transition-colors hover:bg-base-800">
      <p className="whitespace-nowrap text-[9px] uppercase tracking-wide text-base-400">{label}</p>
      <p className={`mt-1 whitespace-nowrap font-mono text-lg font-medium ${accentMap[accent]}`}>{value}</p>
    </div>
  );
}
