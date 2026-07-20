import { LandingData, PrizeListComponent } from "@/lib/landing/types";

export default function PrizeListView({ component, data }: { component: PrizeListComponent; data?: LandingData }) {
  const { fontSize, color, showRemaining } = component.props;
  const prizes = data?.prizes ?? [];

  return (
    <div className="h-full w-full overflow-hidden" style={{ color, fontSize }}>
      {prizes.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-base-500" style={{ fontSize }}>
          No prizes
        </div>
      ) : (
        <ul className="space-y-1">
          {prizes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{p.name}</span>
              {showRemaining && (
                <span className="shrink-0 opacity-70">
                  {p.remaining}/{p.quantity}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
