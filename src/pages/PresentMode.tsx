import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DrawResultRow } from "@/types";

// Đây là trang render trong cửa sổ Present mode riêng biệt (BrowserWindow thứ 2).
// Không có sidebar/toolbar — chỉ hiển thị kết quả để trình chiếu cho khán giả.
// Placeholder này sẽ được thay bằng canvas do drag-drop builder tạo ra ở giai đoạn sau.
export default function PresentMode() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [results, setResults] = useState<DrawResultRow[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const load = () => window.api.sessions.results(sessionId).then(setResults);
    load();
    const interval = setInterval(load, 2000); // poll đơn giản, sau này thay bằng event push
    return () => clearInterval(interval);
  }, [sessionId]);

  const latest = results[0];

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-base-950 text-center">
      <p className="mb-6 font-display text-2xl text-base-400">Draw results</p>
      {latest ? (
        <>
          <p className="font-display text-6xl font-medium text-gold-400">{latest.participant_name}</p>
          <p className="mt-4 text-2xl text-base-200">won {latest.prize_name}</p>
        </>
      ) : (
        <p className="text-2xl text-base-500">Waiting for the first draw...</p>
      )}
    </div>
  );
}
