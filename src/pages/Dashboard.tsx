import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import { useSession } from "@/context/SessionContext";
import { Participant, Prize } from "@/types";

export default function Dashboard() {
  const { sessions, activeSessionId, activeSession, switchTab } = useSession();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);

  useEffect(() => {
    if (!activeSessionId) {
      setParticipants([]);
      setPrizes([]);
      return;
    }
    window.api.participants.list(activeSessionId).then(setParticipants);
    window.api.prizes.list(activeSessionId).then(setPrizes);
  }, [activeSessionId]);

  const totalPrizesRemaining = prizes.reduce((sum, p) => sum + p.remaining, 0);

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl font-medium text-base-100">Dashboard</h1>
        <p className="mt-1 text-sm text-base-400">
          Data for the open session: <span className="text-base-200">{activeSession.name}</span> — each tab is
          fully independent, participants/prizes are not shared with other tabs.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Participants" value={participants.length} hint="In this session" />
        <StatCard
          label="Prizes remaining"
          value={totalPrizesRemaining}
          hint={`Out of ${prizes.reduce((s, p) => s + p.quantity, 0)} prizes total`}
          accent="gold"
        />
        <StatCard label="Total tabs" value={sessions.length} hint="Open draw sessions" accent="teal" />
        <StatCard
          label="Awarded"
          value={prizes.reduce((s, p) => s + (p.quantity - p.remaining), 0)}
          hint="Total wins in this session"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-medium text-base-100">Open tabs</h2>
            <span className="text-xs text-base-500">{sessions.length} tabs</span>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-base-400">No tabs yet. Click "+ Add tab" at the top bar.</p>
          ) : (
            <ul className="divide-y divide-base-800">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <button
                    onClick={() => switchTab(s.id)}
                    className={`text-left hover:text-gold-400 ${
                      s.id === activeSessionId ? "font-medium text-gold-500" : "text-base-200"
                    }`}
                  >
                    {s.name}
                    {s.id === activeSessionId && <span className="ml-2 text-xs text-base-500">(viewing)</span>}
                  </button>
                  <span className="text-xs text-base-500">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <h2 className="mb-3 font-display text-base font-medium text-base-100">Next steps (this session)</h2>
          <ul className="space-y-2 text-sm text-base-300">
            <li className={participants.length ? "line-through text-base-600" : ""}>
              1. Import the participant list (CSV/Excel or Google Sheets)
            </li>
            <li className={prizes.length ? "line-through text-base-600" : ""}>2. Set up the prize list</li>
            <li>3. Go to "Draw" to set up the presentation and run the draw</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
