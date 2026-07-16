import { useEffect, useState } from "react";
import Button from "@/components/Button";
import { useSession } from "@/context/SessionContext";
import { DrawResultRow } from "@/types";

export default function DrawSessionDetail() {
  const { activeSession, activeSessionId, refresh } = useSession();
  const [results, setResults] = useState<DrawResultRow[]>([]);
  const [lastWinner, setLastWinner] = useState<{ name: string; prize: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const loadResults = () => {
    if (activeSessionId) window.api.sessions.results(activeSessionId).then(setResults);
  };

  useEffect(() => {
    loadResults();
    setLastWinner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  async function handleDraw() {
    if (!activeSessionId) return;
    setError(null);
    setDrawing(true);
    try {
      const result = await window.api.draw.one(activeSessionId);
      setLastWinner({ name: result.participantName, prize: result.prizeName });
      loadResults();
    } catch (e: any) {
      setError(e?.message ?? "Có lỗi khi quay số");
    } finally {
      setDrawing(false);
    }
  }

  function handleOpenPresent() {
    if (activeSessionId) window.api.present.open(activeSessionId);
  }

  async function handleUpdateOptions(allowDuplicatePrize: boolean, excludePreviousWinners: boolean) {
    if (!activeSessionId) return;
    await window.api.sessions.updateOptions({ id: activeSessionId, allowDuplicatePrize, excludePreviousWinners });
    refresh();
  }

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        Chưa có phiên nào đang mở. Bấm "+ Thêm tab" ở thanh trên cùng để tạo phiên quay số đầu tiên.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Điều khiển quay số</h1>
          <p className="mt-1 text-sm text-base-400">
            Phiên "{activeSession.name}" · {results.length} lượt đã quay
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowOptions((v) => !v)}>
            Tuỳ chọn phiên
          </Button>
          <Button variant="secondary" onClick={handleOpenPresent}>
            Mở cửa sổ trình chiếu
          </Button>
        </div>
      </header>

      {showOptions && (
        <div className="mb-6 space-y-2 rounded-lg border border-base-800 bg-base-900 p-4">
          <label className="flex items-center justify-between text-sm">
            <span className="text-base-200">Cho phép trùng lặp giải</span>
            <input
              type="checkbox"
              checked={!!activeSession.allow_duplicate_prize}
              onChange={(e) => handleUpdateOptions(e.target.checked, !!activeSession.exclude_previous_winners)}
              className="accent-gold-500"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-base-200">Loại trừ người đã trúng khỏi các lượt sau</span>
            <input
              type="checkbox"
              checked={!!activeSession.exclude_previous_winners}
              onChange={(e) => handleUpdateOptions(!!activeSession.allow_duplicate_prize, e.target.checked)}
              className="accent-gold-500"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-base-800 bg-base-900 p-6 text-center">
            <p className="mb-4 text-xs uppercase tracking-wide text-base-400">Kết quả mới nhất</p>
            {lastWinner ? (
              <div>
                <p className="font-display text-xl font-medium text-gold-400">{lastWinner.name}</p>
                <p className="mt-1 text-sm text-base-300">trúng {lastWinner.prize}</p>
              </div>
            ) : (
              <p className="text-sm text-base-500">Chưa quay lần nào</p>
            )}
            <Button className="mt-6 w-full" onClick={handleDraw} disabled={drawing}>
              {drawing ? "Đang quay..." : "Quay ngay"}
            </Button>
            {error && <p className="mt-3 text-xs text-danger-500">{error}</p>}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-base-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-900 text-xs uppercase tracking-wide text-base-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Người trúng</th>
                  <th className="px-4 py-3 font-medium">Giải</th>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 bg-base-950">
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-base-500">
                      Chưa có kết quả nào.
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
                    <tr key={r.id} className="text-base-200">
                      <td className="px-4 py-3">{r.participant_name}</td>
                      <td className="px-4 py-3 text-gold-400">{r.prize_name}</td>
                      <td className="px-4 py-3 text-xs text-base-500">{r.drawn_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
