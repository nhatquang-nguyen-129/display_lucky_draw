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
  const [participantColumnTypesJson, setParticipantColumnTypesJson] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const data = useLandingData(sessionId ?? null);
  // `config` có thể chưa tải xong (null) ở lần render đầu — 0/false lúc đó là an toàn (chưa biết
  // Wheel/component nào cả), tự tính lại đúng ngay khi `config` có giá trị thật.
  const winnerRevealDelayMs = config ? computeWheelRevealDelayMs(config.components) : 0;
  const requiresPrizeSelection = config ? hasSelectablePrizeUI(config.components) : false;
  const sequence = useDrawSequence(
    sessionId ?? null,
    data,
    data.refresh,
    winnerRevealDelayMs,
    requiresPrizeSelection,
    participantColumnTypesJson
  );

  useEffect(() => {
    if (!sessionId) return;
    const load = () =>
      window.api.sessions.get(sessionId).then((s) => {
        const parsed = parseLandingConfig(s?.landing_config ?? null);
        // Loại bỏ component có type không còn tồn tại trong COMPONENT_REGISTRY (vd landing đã lưu từ
        // trước khi bỏ Trigger Graph) — tránh crash ở LandingRenderer.tsx, cùng cơ chế với
        // LandingBuilderWindow.tsx lúc mở Builder.
        setConfig({ ...parsed, components: parsed.components.filter((c) => !!COMPONENT_REGISTRY[c.type]) });
        setParticipantColumnTypesJson(s?.participant_column_types ?? null);
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

  // Cửa sổ này mở WINDOWED để người vận hành kéo sang màn hình 2 trước, rồi tự bấm fullscreen (nút
  // overlay hoặc F11, xem electron/main.ts openPresentWindow) — nghe cả sự kiện main process báo lại
  // vì trạng thái có thể đổi bằng cách khác ngoài nút này (vd nút xanh lá trên macOS).
  useEffect(() => {
    return window.api.present.onFullscreenChange(setIsFullscreen);
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
        {/* Lỗi Draw/Confirm/Redo/Reset (hết participant, hết giải, timeout IPC...) hiện qua popup
            sequence.infoPrompt bên trong LandingRenderer — cùng chỗ với "Please select a prize
            first!" — không còn thanh chữ đỏ riêng ở đây (trông như lỗi code thay vì 1 thông báo
            nghiệp vụ bình thường). */}
        <LandingRenderer config={config} data={sequence.effectiveData} scale={scale} interactive sequence={sequence} />
      </div>

      {/* Overlay mờ, sáng lên khi hover — không nổi bật giữa màn hình trình chiếu nhưng người vận
          hành vẫn tìm được ở góc quen thuộc. F11 làm việc tương tự (xem electron/main.ts). Bấm được
          bất cứ lúc nào kể cả đang quay — toggle cửa sổ không đụng gì tới sequence đang chạy. */}
      <button
        onClick={() => window.api.present.toggleFullscreen().then(setIsFullscreen)}
        title={isFullscreen ? "Exit fullscreen (F11)" : "Enter fullscreen (F11)"}
        className="fixed right-3 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white opacity-30 transition hover:opacity-100"
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M15 20v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 1-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
          </svg>
        )}
      </button>
    </div>
  );
}
