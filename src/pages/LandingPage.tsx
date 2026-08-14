import { useEffect, useRef, useState } from "react";
import Button from "@/components/Button";
import { useSession } from "@/context/SessionContext";
import LandingRenderer from "@/components/landing/LandingRenderer";
import { useLandingData } from "@/components/landing/useLandingData";
import { COMPONENT_REGISTRY } from "@/components/landing/componentRegistry";
import { CANVAS_HEIGHT, CANVAS_WIDTH, parseLandingConfig } from "@/lib/landing/types";

const CONFIG_POLL_MS = 2000;

// Màn hình chính "Landing Page" — vì mỗi session chỉ có đúng 1 landing page (khác Ladipage có
// danh sách nhiều page), màn hình này luôn LÀ live preview, không có chế độ edit inline. Chỉnh sửa
// bố cục thực hiện trong cửa sổ phụ Landing Builder (mở qua nút bên dưới) — xem LandingBuilderWindow.tsx.
export default function LandingPage() {
  const { activeSessionId, activeSession } = useSession();
  const data = useLandingData(activeSessionId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // activeSession.landing_config qua SessionContext chỉ được nạp lại lúc mount / sau addTab-renameTab-
  // closeTab trong CHÍNH cửa sổ chính — Save từ cửa sổ phụ Landing Builder (1 process khác hẳn) không
  // hề đụng tới SessionContext này nên sẽ không tự cập nhật. Poll trực tiếp qua sessions:get, giống
  // hệt cách PresentMode.tsx đã làm, để màn hình này luôn phản ánh đúng bản đã Save gần nhất.
  const [landingConfigRaw, setLandingConfigRaw] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSessionId) {
      setLandingConfigRaw(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      window.api.sessions.get(activeSessionId).then((s) => {
        if (!cancelled) setLandingConfigRaw(s?.landing_config ?? null);
      });
    };
    poll();
    const interval = setInterval(poll, CONFIG_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSessionId]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const compute = () => {
      const availW = wrapper.clientWidth;
      const availH = wrapper.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      setScale(Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  const parsedConfig = parseLandingConfig(landingConfigRaw);
  // Loại bỏ component có type không còn tồn tại trong COMPONENT_REGISTRY (vd landing đã lưu từ
  // trước khi bỏ Trigger Graph) — tránh crash ở LandingRenderer.tsx, cùng cơ chế với
  // LandingBuilderWindow.tsx/PresentMode.tsx.
  const config = {
    ...parsedConfig,
    components: parsedConfig.components.filter((c) => !!COMPONENT_REGISTRY[c.type]),
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-medium text-base-100">Landing Page</h1>
          <p className="text-xs text-base-500">
            Session "{activeSession.name}" · {config.components.length} component(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.api.present.open(activeSessionId!)} className="text-xs">
            Open Present Window
          </Button>
          <Button onClick={() => window.api.landingBuilder.open(activeSessionId!)} className="text-xs">
            Landing Builder
          </Button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-base-800 bg-base-950 p-6"
      >
        <div style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }} className="shadow-2xl">
          <LandingRenderer config={config} data={data} scale={scale} />
        </div>
      </div>
    </div>
  );
}
