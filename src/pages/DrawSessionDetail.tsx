import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "@/components/Button";
import { DrawResultRow } from "@/types";

export default function DrawSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [results, setResults] = useState<DrawResultRow[]>([]);
  const [lastWinner, setLastWinner] = useState<{ name: string; prize: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);

  const refresh = () => {
    if (sessionId) window.api.sessions.results(sessionId).then(setResults);
  };

  useEffect(() => {
    refresh();
  }, [sessionId]);

  async function handleDraw() {
    if (!sessionId) return;
    setError(null);
    setDrawing(true);
    try {
      const result = await window.api.draw.one(sessionId);
      setLastWinner({ name: result.participantName, prize: result.prizeName });
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Có lỗi khi quay số");
    } finally {
      setDrawing(false);
    }
  }

  function handleOpenPresent() {
    if (sessionId) window.api.present.open(sessionId);
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Điều khiển quay số</h1>
          <p className="mt-1 text-sm text-base-400">{results.length} lượt đã quay trong phiên này</p>
        </div>
        <Button variant="secondary" onClick={handleOpenPresent}>
          Mở cửa sổ trình chiếu
        </Button>
      </header>

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
