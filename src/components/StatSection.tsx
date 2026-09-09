import { ReactNode } from "react";

const accentMap = {
  gold: "text-gold-400",
  teal: "text-teal-400",
  default: "text-base-100",
};

// 1 nhóm chỉ số trên Dashboard — tiêu đề nhỏ + lưới ô CỐ ĐỊNH tối đa 4 cột (2 cột ở màn hẹp). Các ô
// ngăn nhau bằng khe `gap-px` lộ nền container (bg-base-800) thành đường kẻ mảnh, đều mọi hướng và
// không lệch khi xuống hàng. Lưu ý: nếu 1 section có số ô KHÔNG chia hết cho số cột, ô trống cuối
// hàng sẽ lộ mảng nền kẻ — giữ mỗi section đúng bội số cột (hiện tại: 4 ô/section).
export function StatSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-base-400">{title}</h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-base-800 bg-base-800 lg:grid-cols-4">
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
    <div className="min-w-0 bg-base-900 px-6 py-5 transition-colors hover:bg-base-800">
      <p className="text-[11px] uppercase tracking-wide text-base-400">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-medium ${accentMap[accent]}`}>{value}</p>
    </div>
  );
}
