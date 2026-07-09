import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatCard from "@/components/StatCard";
import { Participant, Prize, Session } from "@/types";

export default function Dashboard() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.api.participants.list().then(setParticipants);
    window.api.prizes.list().then(setPrizes);
    window.api.sessions.list().then(setSessions);
  }, []);

  const totalPrizesRemaining = prizes.reduce((sum, p) => sum + p.remaining, 0);
  const activeSessions = sessions.filter((s) => s.status !== "closed").length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl font-medium text-base-100">Tổng quan</h1>
        <p className="mt-1 text-sm text-base-400">
          Trạng thái dữ liệu hiện tại, chạy hoàn toàn cục bộ trên máy này.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Người chơi" value={participants.length} hint="Tổng số đã nhập" />
        <StatCard
          label="Giải còn lại"
          value={totalPrizesRemaining}
          hint={`Trong tổng ${prizes.reduce((s, p) => s + p.quantity, 0)} giải`}
          accent="gold"
        />
        <StatCard label="Phiên quay số" value={sessions.length} hint={`${activeSessions} đang mở`} accent="teal" />
        <StatCard
          label="Đã trao"
          value={prizes.reduce((s, p) => s + (p.quantity - p.remaining), 0)}
          hint="Tổng số lượt trúng"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-medium text-base-100">Phiên quay số gần đây</h2>
            <Link to="/sessions" className="text-xs text-gold-400 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-base-400">Chưa có phiên nào. Tạo phiên đầu tiên ở mục Phiên quay số.</p>
          ) : (
            <ul className="divide-y divide-base-800">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/sessions/${s.id}`} className="text-base-200 hover:text-gold-400">
                    {s.name}
                  </Link>
                  <span className="text-xs text-base-500">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-base-800 bg-base-900 p-5">
          <h2 className="mb-3 font-display text-base font-medium text-base-100">Việc cần làm tiếp</h2>
          <ul className="space-y-2 text-sm text-base-300">
            <li className={participants.length ? "line-through text-base-600" : ""}>
              1. Nhập danh sách người chơi (CSV/Excel hoặc Google Sheets)
            </li>
            <li className={prizes.length ? "line-through text-base-600" : ""}>2. Thiết lập danh sách giải thưởng</li>
            <li className={sessions.length ? "line-through text-base-600" : ""}>
              3. Tạo phiên quay số và bắt đầu quay
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
