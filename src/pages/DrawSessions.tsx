import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { Prize, Session } from "@/types";

export default function DrawSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    prizeIds: [] as string[],
    allowDuplicatePrize: false,
    excludePreviousWinners: true,
  });

  const refresh = () => window.api.sessions.list().then(setSessions);

  useEffect(() => {
    refresh();
    window.api.prizes.list().then(setPrizes);
  }, []);

  function togglePrize(id: string) {
    setForm((f) => ({
      ...f,
      prizeIds: f.prizeIds.includes(id) ? f.prizeIds.filter((x) => x !== id) : [...f.prizeIds, id],
    }));
  }

  async function handleCreate() {
    if (!form.name.trim() || form.prizeIds.length === 0) return;
    const id = await window.api.sessions.create(form);
    setForm({ name: "", prizeIds: [], allowDuplicatePrize: false, excludePreviousWinners: true });
    setShowAdd(false);
    refresh();
    window.location.hash = `#/sessions/${id}`;
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Draw Sessions</h1>
          <p className="mt-1 text-sm text-base-400">Each session has its own prize pool and draw settings.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>+ Create session</Button>
      </header>

      <div className="space-y-3">
        {sessions.length === 0 && (
          <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
            No sessions yet. You need at least 1 prize before creating a session.
          </p>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="flex items-center justify-between rounded-xl border border-base-800 bg-base-900 px-5 py-4 hover:border-gold-500/40"
          >
            <div>
              <p className="font-medium text-base-100">{s.name}</p>
              <p className="mt-1 text-xs text-base-500">
                {s.allow_duplicate_prize ? "Duplicate prizes allowed" : "No duplicate prizes"} ·{" "}
                {s.exclude_previous_winners ? "Excludes previous winners" : "Does not exclude previous winners"}
              </p>
            </div>
            <span className="rounded-full bg-base-800 px-3 py-1 text-xs text-base-300">{s.status}</span>
          </Link>
        ))}
      </div>

      <Modal open={showAdd} title="Create Draw Session" onClose={() => setShowAdd(false)}>
        <div className="space-y-4">
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Session name (e.g. Golden Hour Draw 2pm) *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div>
            <label className="mb-2 block text-xs text-base-400">Prizes used in this session *</label>
            {prizes.length === 0 ? (
              <p className="text-xs text-danger-500">No prizes yet — add a prize first.</p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-base-800 p-2">
                {prizes.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-base-800">
                    <input
                      type="checkbox"
                      checked={form.prizeIds.includes(p.id)}
                      onChange={() => togglePrize(p.id)}
                      className="accent-gold-500"
                    />
                    <span className="text-base-200">{p.name}</span>
                    <span className="ml-auto text-xs text-base-500">{p.remaining} left</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-base-800 p-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-base-200">Allow duplicate prizes</span>
              <input
                type="checkbox"
                checked={form.allowDuplicatePrize}
                onChange={(e) => setForm({ ...form, allowDuplicatePrize: e.target.checked })}
                className="accent-gold-500"
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-base-200">Exclude previous winners from later draws</span>
              <input
                type="checkbox"
                checked={form.excludePreviousWinners}
                onChange={(e) => setForm({ ...form, excludePreviousWinners: e.target.checked })}
                className="accent-gold-500"
              />
            </label>
          </div>

          <Button className="w-full" onClick={handleCreate} disabled={!form.name || form.prizeIds.length === 0}>
            Create session
          </Button>
        </div>
      </Modal>
    </div>
  );
}
