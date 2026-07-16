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
        Chưa có phiên nào đang mở. Bấm "+ Thêm tab" ở thanh trên cùng để tạo phiên đầu tiên.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl font-medium text-base-100">Tổng quan</h1>
        <p className="mt-1 text-sm text-base-400">
          Dữ liệu của phiên đang mở: <span className="text-base-200">{activeSession.name}</span> — mỗi tab độc lập
          hoàn toàn, không chia sẻ người chơi/giải thưởng với tab khác.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Người chơi" value={participants.length} hint="Trong phiên này" />
        <StatCard
          label="Giải còn lại"
          value={totalPrizesRemaining}
          hint={`Trong tổng ${prizes.reduce((s, p) => s + p.quantity, 0)} giải`}
          accent="gold"
        />
        <StatCard label="Tổng số tab" value={sessions.length} hint="Phiên quay số đang mở" accent="teal" />
        <StatCard
          label="Đã trao"
          value={prizes.reduce((s, p) => s + (p.quantity - p.remaining), 0)}
          hint="Tổng số lượt trúng trong phiên này"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-medium text-base-100">Các tab đang mở</h2>
            <span className="text-xs text-base-500">{sessions.length} tab</span>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-base-400">Chưa có tab nào. Bấm "+ Thêm tab" ở thanh trên cùng.</p>
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
                    {s.id === activeSessionId && <span className="ml-2 text-xs text-base-500">(đang xem)</span>}
                  </button>
                  <span className="text-xs text-base-500">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <h2 className="mb-3 font-display text-base font-medium text-base-100">Việc cần làm tiếp (phiên này)</h2>
          <ul className="space-y-2 text-sm text-base-300">
            <li className={participants.length ? "line-through text-base-600" : ""}>
              1. Nhập danh sách người chơi (CSV/Excel hoặc Google Sheets)
            </li>
            <li className={prizes.length ? "line-through text-base-600" : ""}>2. Thiết lập danh sách giải thưởng</li>
            <li>3. Vào mục "Quay số" để bắt đầu quay cho tab này</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
