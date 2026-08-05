import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "@/components/Button";
import ComponentPalette from "@/components/landing/ComponentPalette";
import LandingCanvas, { CanvasTool } from "@/components/landing/LandingCanvas";
import LayersPanel from "@/components/landing/LayersPanel";
import PropertiesPanel from "@/components/landing/PropertiesPanel";
import TriggerGraphEditor from "@/components/landing/triggerGraph/TriggerGraphEditor";
import { createComponentAt } from "@/components/landing/componentRegistry";
import {
  BackgroundConfig,
  ButtonComponent,
  computeDigitRollerFitHeight,
  LandingComponent,
  LandingComponentType,
  LandingConfig,
  parseLandingConfig,
  TriggerGraphLayout,
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
  // Chế độ Trigger Graph — thay hẳn canvas kéo-thả bình thường bằng màn hình sơ đồ node riêng (xem
  // TriggerGraphEditor.tsx), không hiển thị đè lên nhau vì cả 2 đều là bề mặt tương tác toàn màn
  // hình, tránh tranh chấp con trỏ chuột.
  const [graphMode, setGraphMode] = useState(false);
  const [showAddFlyout, setShowAddFlyout] = useState(false);
  // Flyout Layers (xem LayersPanel.tsx) — danh sách + hide/unhide + kéo-thả đổi thứ tự trước/sau,
  // neo vào nút toolbar riêng đúng kiểu flyout Add component đã có sẵn.
  const [showLayers, setShowLayers] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Thông báo LỚN, giữa màn hình — khác hẳn `toast` (chữ nhỏ ở header, dùng cho "Saved."). Dùng cho
  // các trường hợp thao tác THẤT BẠI rõ ràng (vd thả Button khi đã hết action) mà toast nhỏ dễ bị
  // bỏ lỡ vì không ai nhìn lên header ngay lúc đang kéo-thả.
  const [centerNotice, setCenterNotice] = useState<string | null>(null);
  const savedConfigRef = useRef<string>("");

  function showCenterNotice(message: string) {
    setCenterNotice(message);
    setTimeout(() => setCenterNotice(null), 3000);
  }

  useEffect(() => {
    if (!sessionId) return;
    window.api.sessions.get(sessionId).then((s) => {
      setSession(s);
      const parsed = parseLandingConfig(s?.landing_config ?? null);
      // Landing đã lưu TRƯỚC khi có bất biến "Digit Roller auto-fit height" (vd kéo tay to quá từ
      // trước) — tự sửa lại ngay khi mở Builder, không cần người dùng bấm/kéo gì để kích hoạt.
      // savedConfigRef giữ bản GỐC (chưa sửa) nên nếu có thay đổi, badge tự hiện "Unsaved" để người
      // dùng chủ động bấm Save, không âm thầm ghi đè DB.
      const fitted = { ...parsed, components: parsed.components.map(fitDigitRollerHeight) };
      setConfig(fitted);
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

  // Đóng flyout Layers khi click ra ngoài — cùng cơ chế với flyout Add ở trên.
  useEffect(() => {
    if (!showLayers) return;
    const close = () => setShowLayers(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showLayers]);

  // Hand tool vô nghĩa khi đang ở mức zoom out tối đa CỦA CANVAS THƯỜNG (cả landing đã vừa khít
  // khung nhìn, không còn gì để kéo) — tự quay về Select nếu đang zoom out xuống mức đó mà Hand tool
  // vẫn đang bật. CHỈ áp dụng khi KHÔNG ở Trigger Graph — `zoom` ở đây là zoom riêng của Canvas
  // (fit-scale), không liên quan gì tới zoom nội bộ của ReactFlow bên Trigger Graph, nên không được
  // dùng để tự tắt Hand tool bên đó (đã từng khiến Hand tool ở Graph tự bật lại Select ngay lập tức).
  useEffect(() => {
    if (!graphMode && zoom <= MIN_ZOOM && tool === "hand") setTool("select");
  }, [zoom, tool, graphMode]);

  // Phím tắt đổi tool — H = Hand (giống Photoshop; ở Canvas thường chỉ khi đã zoom in, ở Trigger
  // Graph luôn bật được vì màn hình đó không có khái niệm "đã vừa khung"), V hoặc Esc = quay lại
  // Select. Ctrl/Cmd +/- = Zoom In/Out. Delete/Backspace = xoá component đang chọn (đúng hành vi
  // nút "Delete component" trong SharedFields.tsx, chỉ thêm lối tắt bàn phím) — chỉ áp dụng ở canvas
  // thường (bỏ qua khi graphMode, vì selection trong Trigger Graph là 1 khái niệm khác — 1 node/link
  // cục bộ của chính màn hình đó, không phải component đang chọn ở đây). Phải bỏ qua khi đang gõ
  // trong input/textarea/select của Properties Panel, không thì gõ chữ "h" trong nội dung Text
  // component sẽ bị nuốt mất thành phím tắt, và Backspace khi sửa Name/số sẽ vô tình xoá cả component.
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

      if ((e.key === "Delete" || e.key === "Backspace") && !graphMode && selectedId) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "h") {
        if (graphMode || zoom > MIN_ZOOM) setTool("hand");
      } else if (key === "v" || e.key === "Escape") {
        setTool("select");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoom, graphMode, selectedId]);

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
    // Chọn/kéo vào 1 component KHÔNG tự mở panel nếu đang bị ẩn thủ công (nút toggle nổi/✕) — chỉ
    // người dùng bấm đúng nút toggle mới mở lại được, tránh panel tự bật ra ngoài ý muốn mỗi lần
    // click chọn khác. Panel ĐANG mở sẵn thì vẫn cập nhật theo lựa chọn mới như bình thường. Bỏ chọn
    // (click nền trống) vẫn tự ẩn — không có gì để sửa thì không có lý do giữ panel mở.
    if (id === null) setShowPanel(false);
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

  // Chỉ lưu danh sách signal chip đã kéo ra Trigger Graph — vị trí node tự tính lại, không lưu.
  function handleUpdateTriggerGraph(patch: Partial<TriggerGraphLayout>) {
    updateConfig((prev) => ({
      ...prev,
      triggerGraph: { ...prev.triggerGraph, ...patch },
    }));
  }

  function handleUpdateComponent(id: string, patch: Partial<LandingComponent>) {
    updateConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.id === id ? fitDigitRollerHeight({ ...c, ...patch } as LandingComponent) : c
      ),
    }));
  }

  // orderedIds: thứ tự TRƯỚC → SAU do LayersPanel.tsx tính ra sau khi kéo-thả (phần tử đầu = lớp
  // trước cùng) — quy đổi thành zIndex thật (đầu mảng nhận zIndex CAO NHẤT, khớp đúng quy ước
  // "zIndex cao hơn = vẽ sau = nằm trên" đã dùng sẵn ở LandingRenderer.tsx).
  function handleReorderLayers(orderedIds: string[]) {
    updateConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx === -1 ? c : { ...c, zIndex: orderedIds.length - 1 - idx };
      }),
    }));
  }

  function handleUpdateProps(patch: Record<string, any>) {
    if (!selectedId) return;
    updateConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.id === selectedId
          ? fitDigitRollerHeight({ ...c, props: { ...c.props, ...patch } } as LandingComponent)
          : c
      ),
    }));
  }

  // Digit Roller không cho tự do chỉnh height — khung kéo-thả luôn PHẢI sát kích thước thật, không
  // cần bấm nút riêng. height luôn là giá trị DẪN XUẤT từ width + digitCount (xem
  // computeDigitRollerFitHeight), áp lại bất biến này sau MỌI thay đổi (kéo-resize, đổi Digit count,
  // chuyển template sang digitRoller...). Giữ TÂM DỌC cố định khi height đổi (thay vì neo theo cạnh
  // trên/dưới) để khung không bị "nhảy" bất ngờ dù người dùng kéo từ handle nào.
  function fitDigitRollerHeight(c: LandingComponent): LandingComponent {
    if (c.type !== "luckyWheel" || c.props.template !== "digitRoller") return c;
    const height = computeDigitRollerFitHeight(c.width, c.props.digitCount);
    if (height === c.height) return c;
    return { ...c, height, y: c.y + (c.height - height) / 2 };
  }

  function handleDropNewComponent(type: LandingComponentType, x: number, y: number) {
    // Scoreboard chỉ cho phép đúng 1 cái/trang — nó là "cửa sổ phụ" duy nhất hiện danh sách người
    // trúng của CẢ trang (không có khái niệm "Scoreboard thứ 2 hiện khác gì"), thêm cái thứ 2 chỉ
    // gây nhầm lẫn không có lý do nghiệp vụ nào cần.
    if (type === "scoreboard" && (config?.components ?? []).some((c) => c.type === "scoreboard")) {
      showCenterNotice("Can't create more Scoreboards — a page can only have 1.");
      setShowAddFlyout(false);
      return;
    }

    // Button không giới hạn số lượng nữa (Signal Emitter thuần, xem CLAUDE.md) — nhưng tên vẫn phải
    // duy nhất để phân biệt trên Trigger Graph (xem ButtonPanel.tsx), nên tự đặt tên rảnh đầu tiên
    // ("Button", "Button 2", "Button 3"...) khi vừa thả vào, tránh vừa tạo xong đã báo lỗi trùng tên.
    if (type === "button") {
      const usedNames = new Set(
        (config?.components ?? [])
          .filter((c): c is ButtonComponent => c.type === "button")
          .map((c) => c.name?.trim())
      );
      let name = "Button";
      for (let n = 2; usedNames.has(name); n++) name = `Button ${n}`;
      updateConfig((prev) => {
        const component = createComponentAt(type, x, y, prev.components.length) as ButtonComponent;
        component.name = name;
        setSelectedId(component.id);
        setShowPanel(true);
        return { ...prev, components: [...prev.components, component] };
      });
      setShowAddFlyout(false);
      return;
    }

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

  // Huỷ TOÀN BỘ thay đổi chưa lưu (Canvas lẫn Trigger Graph — dùng chung 1 config, không tách
  // riêng) — quay lại đúng bản đã Save gần nhất. Không thể hoàn tác nên luôn hỏi xác nhận trước,
  // đúng quy ước đã dùng cho các thao tác phá huỷ khác trong app (vd Reset Session). Áp lại
  // fitDigitRollerHeight giống hệt lúc mới mở Builder, để khớp đúng bất biến "auto-fit height".
  function handleDiscard() {
    if (!window.confirm("Discard all unsaved changes? This cannot be undone.")) return;
    const reverted = JSON.parse(savedConfigRef.current) as LandingConfig;
    setConfig({ ...reverted, components: reverted.components.map(fitDigitRollerHeight) });
    setSelectedId(null);
    setShowPanel(false);
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
          <Button onClick={handleDiscard} disabled={!dirty || saving} variant="danger" className="text-xs">
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving} className="text-xs">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {graphMode ? (
          <TriggerGraphEditor
            config={config}
            onUpdateComponent={handleUpdateComponent}
            onUpdateTriggerGraph={handleUpdateTriggerGraph}
            tool={tool}
            showGrid={showGrid}
          />
        ) : (
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
        )}

        {/* Thông báo lớn giữa màn hình khi 1 thao tác thất bại rõ ràng (vd hết action Button) —
            tự biến mất sau 3s, không chặn thao tác khác (pointer-events-none). */}
        {centerNotice && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* base-950 = trắng, base-100 = gần đen trong theme này (tên biến giữ từ bản theme tối
                cũ, xem CLAUDE.md) — chữ đen trên nền trắng cho tương phản rõ, khác hẳn kiểu toast
                nhỏ chữ màu ở header. */}
            <div className="flex max-w-sm items-center gap-3 rounded-xl border border-base-700 bg-base-950 px-5 py-4 shadow-2xl">
              <NoEntryIcon />
              <p className="text-left text-sm font-medium text-base-100">{centerNotice}</p>
            </div>
          </div>
        )}

        {/* Toolbar nổi bên trái — Select/Hand tool + Gridline (dùng chung cho cả Canvas thường lẫn
            Trigger Graph, mỗi màn hình tự vẽ lưới bằng cơ chế riêng), Add component, Page settings,
            Trigger graph. Add/Layers/Page settings ẩn hẳn khi đang ở Trigger Graph (không có ý nghĩa
            gì ở đó). Dời hẳn sang phải khi graphMode để không đè lên TriggerSidebar (luôn chiếm
            w-72 = 18rem cố định bên trái, xem TriggerGraphEditor.tsx). */}
        <div className={`absolute top-4 flex flex-col gap-2 ${graphMode ? "left-[19rem]" : "left-4"}`}>
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
              if (graphMode || zoom > MIN_ZOOM) setTool("hand");
            }}
            disabled={!graphMode && zoom <= MIN_ZOOM}
            title={
              !graphMode && zoom <= MIN_ZOOM
                ? "Hand tool needs zooming in first — the page already fits the screen"
                : "Hand tool (H) — hold to pan"
            }
            className={`${floatingBtn} ${
              !graphMode && zoom <= MIN_ZOOM ? floatingBtnDisabled : tool === "hand" ? floatingBtnActive : floatingBtnIdle
            }`}
          >
            <HandIcon />
          </button>

          <div className="h-px bg-base-800" />

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

          {!graphMode && (
            <>
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

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setShowLayers((v) => !v)}
                  title="Layers"
                  className={`${floatingBtn} ${showLayers ? floatingBtnActive : floatingBtnIdle}`}
                >
                  <LayersIcon />
                </button>
                {showLayers && (
                  <div className="absolute left-full top-0 ml-2 rounded-xl border border-base-700 bg-base-900 shadow-2xl">
                    <LayersPanel
                      components={config.components}
                      selectedId={selectedId}
                      onSelect={handleSelect}
                      onToggleHidden={(id) => {
                        const c = config.components.find((c) => c.id === id);
                        if (c) handleUpdateComponent(id, { hiddenInBuilder: !c.hiddenInBuilder });
                      }}
                      onReorder={handleReorderLayers}
                    />
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

              <div className="h-px bg-base-800" />
            </>
          )}

          {/* Ở chế độ Trigger Graph, đổi hẳn nút tròn nhỏ thành 1 nút to, có chữ rõ ràng — tránh
              người dùng không biết cách thoát Trigger Graph ngoài việc đóng hẳn cửa sổ Builder.
              Trigger Graph dùng chung 1 Save/Discard với cả Builder (nút ở góc phải trên) — chuyển
              qua lại giữa Canvas/Graph không mất gì, không cần hỏi xác nhận riêng ở đây. */}
          {graphMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGraphMode(false);
              }}
              title="Back to Builder canvas"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-base-700 bg-base-900 px-3 py-2.5 text-xs font-medium text-base-100 shadow-lg hover:border-gold-500/50"
            >
              <BackArrowIcon />
              Back to Builder
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGraphMode(true);
              }}
              title="Trigger graph"
              className={`${floatingBtn} ${floatingBtnIdle}`}
            >
              <GraphIcon />
            </button>
          )}
        </div>

        {/* Chỉ báo mức zoom + nút +/- nổi góc dưới trái — Ctrl/Cmd +/- vẫn là cách chính, đây chỉ để
            biết đang ở mức nào và có lối bấm chuột thay thế cho phím tắt. Chỉ có ý nghĩa cho canvas
            thường — Trigger Graph có zoom/pan riêng của chính nó (điều khiển trong ReactFlow). */}
        {!graphMode && (
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
        )}

        {/* Properties Panel nổi bên phải — chỉ hiện khi cần (chọn component hoặc mở Page settings).
            Không có ý nghĩa gì ở Trigger Graph (không có "component đang chọn" theo nghĩa canvas
            thường — chọn edge/node có inspector riêng của chính TriggerGraphEditor). */}
        {!graphMode && showPanel && (
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
                onChangeBackground={handleChangeBackground}
                onChangeComponent={(patch) => selectedId && handleUpdateComponent(selectedId, patch)}
                onChangeProps={handleUpdateProps}
                onDelete={handleDeleteSelected}
              />
            </div>
          </div>
        )}

        {/* Tab nổi để mở lại Properties Panel sau khi đã tạm ẩn (nút ✕ ở trên chỉ ẩn, không xoá
            lựa chọn) — không cần click lại đúng component trên canvas, tránh phải rà đúng vị trí
            khi nó vừa bị khung panel che mất. Luôn hiện khi panel đang ẩn, kể cả chưa chọn gì (bấm
            vào sẽ mở lại đúng Page settings, giống hành vi mặc định của PropertiesPanel). */}
        {!graphMode && !showPanel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPanel(true);
            }}
            title="Show panel"
            className={`absolute right-4 top-4 ${floatingBtn} ${floatingBtnIdle}`}
          >
            <PanelIcon />
          </button>
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

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3.5 3 8l9 4.5 9-4.5-9-4.5Z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16l9 4.5 9-4.5" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
      <path d="M7.3 7.2 16.7 10.8" />
      <path d="M7.3 16.8 16.7 13.2" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16" />
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

// Icon "biển báo cấm" (vòng tròn + gạch chéo) cho thông báo giữa màn hình khi 1 thao tác bị chặn
// hẳn (xem centerNotice) — màu đỏ để đọc ngay là cảnh báo/không cho phép, tách biệt khỏi phần
// chữ đen (tương phản tốt trên nền trắng của thẻ thông báo).
function NoEntryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7 shrink-0 text-danger-500">
      <circle cx="12" cy="12" r="9" />
      <path d="M7 12h10" />
    </svg>
  );
}
