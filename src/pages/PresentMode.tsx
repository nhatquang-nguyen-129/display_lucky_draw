import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useLandingData } from "@/components/landing/useLandingData";
import { useDrawSequence } from "@/components/landing/useDrawSequence";
import LandingRenderer from "@/components/landing/LandingRenderer";
import { COMPONENT_REGISTRY } from "@/components/landing/componentRegistry";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  computeWheelRevealDelayMs,
  hasSelectablePrizeUI,
  LandingConfig,
  parseLandingConfig,
} from "@/lib/landing/types";

const CONFIG_POLL_MS = 2000;

// Cửa sổ trình chiếu — CHỈ render LandingConfig của session, không có logic riêng nào khác.
// Builder chỉnh sửa JSON, ở đây chỉ đọc. Poll lại session định kỳ để nếu người dùng Save thay đổi
// trong Builder khi cửa sổ này đang mở, nó tự cập nhật mà không cần mở lại.
export default function PresentMode() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [scale, setScale] = useState(1);
  const data = useLandingData(sessionId ?? null);
  // `config` có thể chưa tải xong (null) ở lần render đầu — 0/false lúc đó là an toàn (chưa biết
  // Wheel/component nào cả), tự tính lại đúng ngay khi `config` có giá trị thật.
  const winnerRevealDelayMs = config ? computeWheelRevealDelayMs(config.components) : 0;
  const requiresPrizeSelection = config ? hasSelectablePrizeUI(config.components) : false;
  const sequence = useDrawSequence(sessionId ?? null, data, data.refresh, winnerRevealDelayMs, requiresPrizeSelection);

  useEffect(() => {
    if (!sessionId) return;
    const load = () =>
      window.api.sessions.get(sessionId).then((s) => {
        const parsed = parseLandingConfig(s?.landing_config ?? null);
        // Loại bỏ component có type không còn tồn tại trong COMPONENT_REGISTRY (vd landing đã lưu từ
        // trước khi bỏ Trigger Graph) — tránh crash ở LandingRenderer.tsx, cùng cơ chế với
        // LandingBuilderWindow.tsx lúc mở Builder.
        setConfig({ ...parsed, components: parsed.components.filter((c) => !!COMPONENT_REGISTRY[c.type]) });
      });
    load();
    const interval = setInterval(load, CONFIG_POLL_MS);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    // BrowserWindow trình chiếu có thể bị kéo-thả resize (kể cả sang màn hình 2) — luôn scale để
    // vừa khung hiện tại nhưng giữ đúng tỉ lệ 16:9, phần dư 2 bên/trên-dưới tô màu nền (letterbox).
    const compute = () => {
      setScale(Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  if (!config) {
    return <div className="flex h-screen w-screen items-center justify-center bg-base-950 text-base-500">Loading...</div>;
  }

  return (
    <div
      className="flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{ backgroundColor: config.canvas.background.color }}
    >
      <div style={{ width: config.canvas.width * scale, height: config.canvas.height * scale }}>
        <LandingRenderer config={config} data={sequence.effectiveData} scale={scale} interactive sequence={sequence} />
      </div>
      {sequence.error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-danger-500/40 bg-base-950/90 px-4 py-2 text-sm text-danger-500 shadow-2xl">
          {sequence.error}
        </div>
      )}
    </div>
  );
}
