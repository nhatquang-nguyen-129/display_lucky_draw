import { useEffect, useState } from "react";
import Button from "@/components/Button";
import PrizeFormModal from "@/components/PrizeFormModal";
import { useSession } from "@/context/SessionContext";
import { Prize } from "@/types";

function GiftPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6 text-base-400">
      <rect x="3" y="9" width="18" height="4" rx="1" />
      <rect x="5" y="13" width="14" height="8" rx="1" />
      <path d="M12 9v12" />
      <path d="M12 9c-1.5-3-3.5-4-4.7-2.8C6 7.5 7.5 9 12 9Z" />
      <path d="M12 9c1.5-3 3.5-4 4.7-2.8C18 7.5 16.5 9 12 9Z" />
    </svg>
  );
}

export default function Prizes() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Prize[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prize | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    if (activeSessionId) window.api.prizes.list(activeSessionId).then(setItems);
    else setItems([]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(prize: Prize) {
    setEditing(prize);
    setShowForm(true);
  }

  function handleSaved(message: string) {
    setToast(message);
    refresh();
  }

  async function handleDelete(prize: Prize) {
    if (!confirm(`Delete prize "${prize.name}"? This cannot be undone.`)) return;
    await window.api.prizes.delete(prize.id);
    refresh();
  }

  const totalWeight = items.reduce((s, p) => s + p.weight, 0);
  const existingCodes = items
    .filter((p) => !editing || p.id !== editing.id)
    .map((p) => p.code)
    .filter((c): c is string => !!c);

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Prizes</h1>
          <p className="mt-1 text-sm text-base-400">
            Session "{activeSession.name}" — {items.length} prizes, entered directly through the popup, no file
            import support.
          </p>
        </div>
        <Button onClick={openAdd}>+ Add prize</Button>
      </header>

      {toast && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm text-teal-400">
          {toast}
          <button onClick={() => setToast(null)} className="text-teal-400/70 hover:text-teal-400">
            ×
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
          No prizes yet. Click "+ Add prize" to enter your first prize.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const chance = totalWeight > 0 ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
            const isInactive = p.status === "inactive";
            return (
              <div
                key={p.id}
                className={`flex items-center gap-4 rounded-xl border p-3 ${
                  isInactive ? "border-base-800 bg-base-900/50 opacity-60" : "border-base-800 bg-base-900"
                }`}
              >
                {/* Thumbnail — nhận diện nhanh giải nào */}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-700 bg-base-800">
                  {p.display_image ? (
                    <img src={p.display_image} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <GiftPlaceholderIcon />
                  )}
                </div>

                {/* Thông tin chính */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.code && (
                      <span className="rounded bg-base-800 px-1.5 py-0.5 font-mono text-xs text-base-300">
                        {p.code}
                      </span>
                    )}
                    <span className="font-display text-base font-medium text-base-100">{p.name}</span>
                    {p.category && <span className="text-xs text-base-500">· {p.category}</span>}
                    <span
                      className={`ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                        isInactive ? "bg-base-800 text-base-500" : "bg-teal-500/10 text-teal-400"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isInactive ? "bg-base-500" : "bg-teal-400"}`} />
                      {isInactive ? "Hidden" : "Active"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-400">
                    <span>
                      Remaining <span className="font-mono text-base-200">{p.remaining}/{p.quantity}</span>
                    </span>
                    <span>
                      Weight <span className="font-mono text-base-200">{p.weight}</span> (~
                      <span className="font-mono text-gold-400">{chance}%</span>)
                    </span>
                    {!!p.allow_duplicate_with_other_prizes && (
                      <span className="rounded bg-base-800 px-1.5 py-0.5">Duplicate with other prizes: yes</span>
                    )}
                    {!!p.allow_duplicate_with_same_prize ? (
                      <span className="rounded bg-base-800 px-1.5 py-0.5">
                        Duplicate with itself: up to {p.max_win_count}x
                      </span>
                    ) : (
                      <span className="rounded bg-base-800 px-1.5 py-0.5">Duplicate with itself: no</span>
                    )}
                  </div>
                </div>

                {/* Hành động */}
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => openEdit(p)} className="text-xs">
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(p)} className="text-xs">
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PrizeFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={handleSaved}
        sessionId={activeSessionId!}
        existingCodes={existingCodes}
        editing={editing}
      />
    </div>
  );
}
