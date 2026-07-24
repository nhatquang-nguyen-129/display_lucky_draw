import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "@/components/Button";
import ComponentPalette from "@/components/landing/ComponentPalette";
import LandingCanvas, { CanvasTool } from "@/components/landing/LandingCanvas";
import PropertiesPanel from "@/components/landing/PropertiesPanel";
import { createComponentAt } from "@/components/landing/componentRegistry";
import {
  BackgroundConfig,
  LandingComponent,
  LandingComponentType,
  LandingConfig,
  parseLandingConfig,
} from "@/lib/landing/types";
import { Participant, Prize, Session } from "@/types";

const floatingBtn =
  "flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors";
const floatingBtnIdle = "border-base-700 bg-base-900 text-base-100 hover:border-gold-500/50";
const floatingBtnActive = "border-gold-500 bg-gold-500 text-base-950";
const floatingBtnDisabled = "border-base-800 bg-base-900 text-base-700 cursor-not-allowed";

// 1 = tỉ lệ "vừa khung" (zoom out tối đa — cả landing đã full khung nhìn, Hand tool vô nghĩa
// và bị disable ở mức này). 4 = phóng to 400% so với tỉ lệ vừa khung.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

// Cửa sổ phụ Landing Builder — canvas chiếm toàn màn hình, mọi thao tác qua nút nổi (Add/Page
// settings/Gridline) thay vì layout 3 cột cố định, giống phong cách builder kiểu Ladipage/Canva.
// Không dùng SessionContext vì đây là cửa sổ tách biệt (route ngoài <Layout>) — tự fetch session
// qua sessions:get, giống PresentMode.
export default function LandingBuilderWindow() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showAddFlyout, setShowAddFlyout] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const savedConfigRef = useRef<string>("");

  useEffect(() => {
    if (!sessionId) return;
    window.api.sessions.get(sessionId).then((s) => {
      setSession(s);
      const parsed = parseLandingConfig(s?.landing_config ?? null);
      setConfig(parsed);
      savedConfigRef.current = JSON.stringify(parsed);
    });
  }, [sessionId]);

  // Danh sách Prize (kèm display_image) cho picker ảnh giải trong LiveImagePanel — poll nhẹ để
  // ảnh mới thêm/xoá ở màn Prizes (cửa sổ chính) hiện ra mà không cần mở lại Builder.
  useEffect(() => {
    if (!sessionId) return;
    const load = () => window.api.prizes.list(sessionId).then(setPrizes);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Danh sách Participant — dùng để lọc field nào thực sự có dữ liệu trong LuckyWheelPanel (vd
  // Email bỏ trống hết thì không cho chọn làm Draw/Display field, xem LuckyWheelPanel.tsx). Poll
  // nhẹ giống Prize để dữ liệu sửa ở Data Editor (cửa sổ khác) phản ánh vào Builder không cần mở lại.
  useEffect(() => {
    if (!sessionId) return;
    const load = () => window.api.participants.list(sessionId).then(setParticipants);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Cột nào đã được gán Loại dữ liệu "url" ở Data Editor — nguồn cho picker của Button action
  // "openLink" (xem ButtonPanel.tsx). Tính lại mỗi khi session đổi, không cần state riêng.
  const urlFields = useMemo(() => {
    if (!session?.participant_column_types) return [];
    try {
      const types = JSON.parse(session.participant_column_types) as Record<string, string>;
      return Object.entries(types)
        .filter(([, type]) => type === "url")
        .map(([field]) => field);
    } catch {
      return [];
    }
  }, [session?.participant_column_types]);

  const dirty = !!config && JSON.stringify(config) !== savedConfigRef.current;

  useEffect(() => {
    window.api.landingBuilder.reportDirty(dirty);
  }, [dirty]);
  useEffect(() => () => window.api.landingBuilder.reportDirty(false), []);

  // Đóng flyout Add khi click ra ngoài — cùng kiểu với các dropdown khác trong app (DataEditorModal).
  useEffect(() => {
    if (!showAddFlyout) return;
    const close = () => setShowAddFlyout(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showAddFlyout]);

  // Hand tool vô nghĩa khi đang ở mức zoom out tối đa (cả landing đã vừa khít khung nhìn, không
  // còn gì để kéo) — tự quay về Select nếu đang zoom out xuống mức đó mà Hand tool vẫn đang bật.
  useEffect(() => {
    if (zoom <= MIN_ZOOM && tool === "hand") setTool("select");
  }, [zoom, tool]);

  // Phím tắt đổi tool — H = Hand (giống Photoshop, chỉ khi đã zoom in), V hoặc Esc = quay lại
  // Select. Ctrl/Cmd +/- = Zoom In/Out. Phải bỏ qua khi đang gõ trong input/textarea/select của
  // Properties Panel, không thì gõ chữ "h" trong nội dung Text component sẽ bị nuốt mất thành phím tắt.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (isTyping) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
        return;
      }
      if (mod || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "h") {
        if (zoom > MIN_ZOOM) setTool("hand");
      } else if (key === "v" || e.key === "Escape") {
        setTool("select");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoom]);

  if (!config || !session) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-base-950 text-base-500">Loading...</div>
    );
  }

  const selected = config.components.find((c) => c.id === selectedId) ?? null;

  function updateConfig(updater: (prev: LandingConfig) => LandingConfig) {
    setConfig((prev) => (prev ? updater(prev) : prev));
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    setShowPanel(id !== null);
  }

  function handleTogglePageSettings() {
    if (showPanel && !selected) {
      setShowPanel(false);
    } else {
      setSelectedId(null);
      setShowPanel(true);
    }
  }

  function handleChangeBackground(patch: Partial<BackgroundConfig>) {
    updateConfig((prev) => ({
      ...prev,
      canvas: { ...prev.canvas, background: { ...prev.canvas.background, ...patch } },
    }));
  }

  function handleUpdateComponent(id: string, patch: Partial<LandingComponent>) {
    updateConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.id === id ? ({ ...c, ...patch } as LandingComponent) : c)),
    }));
  }

  function handleUpdateProps(patch: Record<string, any>) {
    if (!selectedId) return;
    updateConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.id === selectedId ? ({ ...c, props: { ...c.props, ...patch } } as LandingComponent) : c
      ),
    }));
  }

  function handleDropNewComponent(type: LandingComponentType, x: number, y: number) {
    updateConfig((prev) => {
      const component = createComponentAt(type, x, y, prev.components.length);
      setSelectedId(component.id);
      setShowPanel(true);
      return { ...prev, components: [...prev.components, component] };
    });
    setShowAddFlyout(false);
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    updateConfig((prev) => ({ ...prev, components: prev.components.filter((c) => c.id !== selectedId) }));
    setSelectedId(null);
    setShowPanel(false);
  }

  async function handleSave() {
    if (!config || !sessionId) return;
    setSaving(true);
    try {
      await window.api.sessions.updateLandingConfig({ id: sessionId, landingConfig: config });
      savedConfigRef.current = JSON.stringify(config);
      setToast("Saved.");
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-base-950">
      <div className="flex shrink-0 items-center justify-between border-b border-base-800 bg-base-900 px-4 py-2">
        <div>
          <p className="text-sm font-medium text-base-100">Landing Builder</p>
          <p className="text-xs text-base-500">{session.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {toast && <span className="text-xs text-teal-400">{toast}</span>}
          <span className="text-xs text-base-500">
            {dirty ? <span className="text-highlight-500">Unsaved</span> : <span className="text-teal-400">Saved</span>}
          </span>
          <Button onClick={handleSave} disabled={!dirty || saving} className="text-xs">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <LandingCanvas
          config={config}
          selectedId={selectedId}
          showGrid={showGrid}
          tool={tool}
          zoom={zoom}
          onSelect={handleSelect}
          onUpdateComponent={handleUpdateComponent}
          onDropNewComponent={handleDropNewComponent}
        />

        {/* Toolbar nổi bên trái — Select/Hand tool, Add component, Page settings, Gridline. */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTool("select");
            }}
            title="Select tool (V)"
            className={`${floatingBtn} ${tool === "select" ? floatingBtnActive : floatingBtnIdle}`}
          >
            <SelectIcon />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (zoom > MIN_ZOOM) setTool("hand");
            }}
            disabled={zoom <= MIN_ZOOM}
            title={
              zoom <= MIN_ZOOM
                ? "Hand tool needs zooming in first — the page already fits the screen"
                : "Hand tool (H) — hold to pan the canvas"
            }
            className={`${floatingBtn} ${
              zoom <= MIN_ZOOM ? floatingBtnDisabled : tool === "hand" ? floatingBtnActive : floatingBtnIdle
            }`}
          >
            <HandIcon />
          </button>

          <div className="h-px bg-base-800" />

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowAddFlyout((v) => !v)}
              title="Add component"
              className={`${floatingBtn} ${showAddFlyout ? floatingBtnActive : floatingBtnIdle}`}
            >
              <span className="text-2xl leading-none">+</span>
            </button>
            {showAddFlyout && (
              <div className="absolute left-full top-0 ml-2 w-56 rounded-xl border border-base-700 bg-base-900 shadow-2xl">
                <ComponentPalette />
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePageSettings();
            }}
            title="Page settings (background)"
            className={`${floatingBtn} ${showPanel && !selected ? floatingBtnActive : floatingBtnIdle}`}
          >
            <BackgroundIcon />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowGrid((v) => !v);
            }}
            title="Toggle gridlines"
            className={`${floatingBtn} ${showGrid ? floatingBtnActive : floatingBtnIdle}`}
          >
            <GridIcon />
          </button>
        </div>

        {/* Chỉ báo mức zoom + nút +/- nổi góc dưới trái — Ctrl/Cmd +/- vẫn là cách chính, đây chỉ để
            biết đang ở mức nào và có lối bấm chuột thay thế cho phím tắt. */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-full border border-base-700 bg-base-900 px-1.5 py-1 text-xs text-base-300 shadow-lg">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
            }}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out (Ctrl/Cmd -)"
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-base-800 disabled:cursor-not-allowed disabled:text-base-700"
          >
            −
          </button>
          <span className="w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
            }}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in (Ctrl/Cmd +)"
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-base-800 disabled:cursor-not-allowed disabled:text-base-700"
          >
            +
          </button>
        </div>

        {/* Properties Panel nổi bên phải — chỉ hiện khi cần (chọn component hoặc mở Page settings). */}
        {showPanel && (
          <div
            className="absolute right-4 top-4 flex max-h-[calc(100%-2rem)] w-72 flex-col overflow-hidden rounded-xl border border-base-700 bg-base-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-base-800 px-3 py-2">
              <span className="text-xs font-medium capitalize text-base-200">
                {selected ? selected.type.replace(/([A-Z])/g, " $1") : "Page settings"}
              </span>
              <button onClick={() => setShowPanel(false)} className="text-base-500 hover:text-base-200">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              <PropertiesPanel
                config={config}
                selected={selected}
                sessionName={session.name}
                prizes={prizes}
                participants={participants}
                urlFields={urlFields}
                onChangeBackground={handleChangeBackground}
                onChangeComponent={(patch) => selectedId && handleUpdateComponent(selectedId, patch)}
                onChangeProps={handleUpdateProps}
                onDelete={handleDeleteSelected}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M6 3l14 8.2-6 1.3-1.3 6L6 3Z" strokeLinejoin="round" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5.5" />
      <path d="M11 11.5V4.5a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 8.5a1.5 1.5 0 0 1 3 0V15c0 3.9-2.6 7-7 7h-1c-3 0-4.2-1-5.7-3l-2.6-4.3c-.5-.8-.2-1.8.6-2.2.7-.4 1.6-.2 2.1.5L8 13" />
    </svg>
  );
}

function BackgroundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
