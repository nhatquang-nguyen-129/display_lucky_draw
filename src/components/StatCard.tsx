interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "gold" | "teal" | "default";
}

const accentMap = {
  gold: "text-gold-400",
  teal: "text-teal-400",
  default: "text-base-100",
};

export default function StatCard({ label, value, hint, accent = "default" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-base-800 bg-base-900 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-base-400">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-medium ${accentMap[accent]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-base-500">{hint}</p>}
    </div>
  );
}
