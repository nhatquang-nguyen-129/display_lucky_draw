import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "@/components/Button";
import ComponentPalette from "@/components/landing/ComponentPalette";
import LandingCanvas, { CanvasTool } from "@/components/landing/LandingCanvas";
import LayersPanel from "@/components/landing/LayersPanel";
import PropertiesPanel from "@/components/landing/PropertiesPanel";
import { COMPONENT_REGISTRY, createComponentAt } from "@/components/landing/componentRegistry";
import { useConfigHistory } from "@/components/landing/useConfigHistory";
import {
  AnchorEditTarget,
  BackgroundConfig,
  ButtonComponent,
  computeDigitRollerFitHeight,
  DEFAULT_PRIZE_GROUP_EFFECT,
  DEFAULT_PRIZE_STAGE_EFFECT,
  LandingComponent,
  LandingComponentType,
  LandingConfig,
  LandingData,
  parseLandingConfig,
  PrizeGroupEffect,
  PrizeStageKey,
} from "@/lib/landing/types";
import { Participant, Prize, Session } from "@/types";

const floatingBtn =
  "flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors";
const floatingBtnIdle = "border-base-700 bg-base-900 text-base-100 hover:border-gold-500/50";
const floatingBtnActive = "border-gold-500 bg-gold-500 text-base-950";
const floatingBtnDisabled = "border-base-800 bg-base-900 text-base-700 cursor-not-allowed";

// Nút icon nhỏ trong header (Undo/Redo/History) — phẳng, khác hẳn floatingBtn (tròn nổi, dành riêng
// cho toolbar canvas), khớp phong cách header đang có.
const headerIconBtn =
  "flex h-7 w-7 items-center justify-center rounded-md text-base-300 transition-colors hover:bg-base-800 hover:text-base-100 disabled:cursor-not-allowed disabled:text-base-700 disabled:hover:bg-transparent";

// Popup nhỏ hiện khi di chuột vào nút toolbar — tên nút + phím tắt, thay cho tooltip mặc định của
// trình duyệt (title, có độ trễ ~1s và không style được). `delay-300` để không nhấp nháy khi rê
// chuột lướt qua nhiều nút liên tiếp; đặt bên PHẢI nút (left-full) vì cả cụm nút nằm dọc theo mép trái.
function ToolbarTooltip({ label, shortcut, children }: { label: string; shortcut: string; children: ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-base-100 px-2 py-1 text-xs font-medium text-base-950 opacity-0 shadow-lg transition-opacity delay-300 group-hover:opacity-100">
        {label}
        <span className="ml-1.5 rounded border border-base-950/20 bg-base-950/10 px-1 text-[10px]">{shortcut}</span>
      </div>
    </div>
  );
}

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
  // Undo/Redo — xem doc-comment đầu useConfigHistory.ts. `config` giữ nguyên tên/kiểu như trước
  // (LandingConfig | null) để không phải sửa lại MỌI chỗ đang đọc `config` bên dưới.
  const history = useConfigHistory();
  const config = history.config;
  // Nhiều component có thể được chọn cùng lúc (Ctrl/Cmd+click hoặc kéo-marquee, xem LandingCanvas.tsx)
  // — mảng rỗng = không chọn gì, đúng 1 phần tử = chọn đơn (Properties Panel hiện form riêng theo
  // type), nhiều hơn 1 = Properties Panel chỉ hiện "N components selected" + xoá hàng loạt.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Đang sửa điểm neo Scale Up trực tiếp trên canvas (bấm nút ở ScaleAnchorTrigger.tsx bên Properties
  // Panel, kéo-thả thật sự vẽ ở ScaleAnchorOverlay.tsx trong LandingCanvas.tsx) — xem doc-comment
  // AnchorEditTarget trong types.ts. `null` = không có gì đang sửa.
  const [anchorEdit, setAnchorEdit] = useState<AnchorEditTarget | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showAddFlyout, setShowAddFlyout] = useState(false);
  // Flyout Layers (xem LayersPanel.tsx) — danh sách + hide/unhide + kéo-thả đổi thứ tự trước/sau,
  // neo vào nút toolbar riêng đúng kiểu flyout Add component đã có sẵn.
  const [showLayers, setShowLayers] = useState(false);
  // Flyout History (xem useConfigHistory.ts) — danh sách các bước đã áp dụng, click 1 dòng để rollback
  // thẳng tới đó, cùng cơ chế với History panel của Data Editor.
  const [showHistory, setShowHistory] = useState(false);
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
      // Loại bỏ component có type KHÔNG còn tồn tại trong COMPONENT_REGISTRY (vd landing đã lưu từ
      // trước khi bỏ Trigger Graph, còn Fireworks/Stage Light/Dim Background/Draw/Confirm Winner/
      // Link Opener) — tránh crash ở bất kỳ chỗ nào tra COMPONENT_REGISTRY[c.type] (LayersPanel.tsx,
      // ComponentPalette.tsx...) mà không có null-check. Component thuộc type còn hợp lệ giữ nguyên.
      const known = parsed.components.filter((c) => !!COMPONENT_REGISTRY[c.type]);
      // Landing đã lưu TRƯỚC khi có bất biến "Digit Roller auto-fit height" (vd kéo tay to quá từ
      // trước) — tự sửa lại ngay khi mở Builder, không cần người dùng bấm/kéo gì để kích hoạt.
      // savedConfigRef giữ bản GỐC (chưa sửa) nên nếu có thay đổi, badge tự hiện "Unsaved" để người
      // dùng chủ động bấm Save, không âm thầm ghi đè DB.
      const fitted = { ...parsed, components: known.map(fitDigitRollerHeight) };
      history.reset(fitted);
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

  // Truyền xuống LandingCanvas -> LandingRenderer để Prize Image/Prize Gallery hiện ĐÚNG ảnh giải
  // thật ngay trên canvas Builder (trước đây canvas không nhận `data` gì cả nên 2 component đó luôn
  // rơi vào nhánh "No image" dù Prize đã có ảnh). `results: []` vì Builder không cần biết kết quả quay
  // — WinnerName/PrizeName vẫn tự hiện fallbackText đúng như khi chưa có data.
  const landingData: LandingData = useMemo(
    () => ({ participants, prizes, results: [] }),
    [participants, prizes]
  );

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

  // Đóng flyout History khi click ra ngoài — cùng cơ chế với flyout Layers ở trên.
  useEffect(() => {
    if (!showHistory) return;
    const close = () => setShowHistory(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showHistory]);

  // Đổi vùng chọn — tự suy ra `anchorEdit` MỚI theo component vừa chọn, KHÔNG cần người dùng bấm gì:
  // đúng 1 component đang chọn và nó CÓ SẴN 1 stage đã cấu hình scaleUp (`anchorPlaced`) HOẶC lift (kéo
  // lệch khỏi tâm, xem doc-comment PrizeGroupEffect trong types.ts) → tự hiện lại pin ở mode "locked"
  // (thuần hiển thị, xem AnchorEditTarget); không có gì khớp (bỏ chọn/chọn nhiều/chọn component khác
  // chưa cấu hình gì) → tắt hẳn. Đang trỏ ĐÚNG component hiện tại rồi (dù đang placing/editing/locked)
  // thì GIỮ NGUYÊN, không ép lại — tránh cắt ngang phiên đang thao tác dở chỉ vì `config` đổi (mỗi lần
  // kéo pin đều đổi config).
  useEffect(() => {
    if (anchorEdit && selectedIds.length === 1 && selectedIds[0] === anchorEdit.componentId) return;
    if (selectedIds.length !== 1) {
      setAnchorEdit(null);
      return;
    }
    const id = selectedIds[0];
    const component = config?.components.find((c) => c.id === id);
    const props: Record<string, any> | undefined = component?.props;
    const stageOrder: PrizeStageKey[] = ["onHover", "onSelect", "onWon", "onOutOfStock"];
    function isConfigured(focus: any): boolean {
      if (!focus) return false;
      if (focus.effect === "scaleUp") return !!focus.anchorPlaced;
      if (focus.effect === "lift") return focus.handleX !== 50 || focus.handleY !== 50;
      return false;
    }
    const matchedStage = props ? stageOrder.find((key) => isConfigured(props[key]?.focus)) : undefined;
    setAnchorEdit(matchedStage ? { componentId: id, stageKey: matchedStage, mode: "locked" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Hand tool vô nghĩa khi đang ở mức zoom out tối đa (cả landing đã vừa khít khung nhìn, không còn
  // gì để kéo) — tự quay về Select nếu đang zoom out xuống mức đó mà Hand tool vẫn đang bật.
  useEffect(() => {
    if (zoom <= MIN_ZOOM && tool === "hand") setTool("select");
  }, [zoom, tool]);

  // Phím tắt đổi tool — H = Hand (giống Photoshop, chỉ khi đã zoom in), V hoặc Esc = quay lại Select,
  // G = bật/tắt Gridline (giống hệt nút Gridline ở toolbar). Ctrl/Cmd +/- = Zoom In/Out.
  // Delete/Backspace = xoá component đang chọn (đúng hành vi nút "Delete component" trong
  // SharedFields.tsx, chỉ thêm lối tắt bàn phím). Phải bỏ qua khi đang gõ trong input/textarea/select
  // của Properties Panel, không thì gõ chữ "h" trong nội dung Text component sẽ bị nuốt mất thành
  // phím tắt, và Backspace khi sửa Name/số sẽ vô tình xoá cả component.
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
      // Ctrl/Cmd+Z = Undo, Ctrl/Cmd+Shift+Z hoặc Ctrl/Cmd+Y = Redo (2 cách gõ Redo phổ biến trên
      // Windows/macOS) — xem useConfigHistory.ts.
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
        return;
      }
      if (mod || e.altKey) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "h") {
        if (zoom > MIN_ZOOM) setTool("hand");
      } else if (key === "v" || e.key === "Escape") {
        setTool("select");
      } else if (key === "g") {
        setShowGrid((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoom, selectedIds]);

  if (!config || !session) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-base-950 text-base-500">Loading...</div>
    );
  }

  // Form riêng theo type ở Properties Panel chỉ có ý nghĩa khi đang chọn ĐÚNG 1 component — chọn
  // nhiều thì `selected` để rỗng, Properties Panel tự chuyển sang hiện "N components selected"
  // (xem PropertiesPanel.tsx, dựa vào `selectedCount` truyền riêng bên dưới).
  const selected = selectedIds.length === 1 ? config.components.find((c) => c.id === selectedIds[0]) ?? null : null;

  // `commit: true` LUÔN tách thành 1 bước lịch sử RIÊNG (Add/Delete/Reorder...); mặc định (commit bỏ
  // trống) GỘP vào bước hiện tại nếu cách lần sửa gần nhất dưới 600ms — đúng hành vi cần cho kéo-thả/
  // resize trên canvas (bắn liên tục mỗi mousemove) và gõ chữ liên tục trong Properties Panel, xem
  // doc-comment đầu useConfigHistory.ts.
  function updateConfig(updater: (prev: LandingConfig) => LandingConfig, opts?: { commit?: boolean; label?: string }) {
    history.set(updater, opts);
  }

  function labelForComponent(c: LandingComponent | undefined | null): string {
    return c ? COMPONENT_REGISTRY[c.type]?.label ?? c.type : "component";
  }

  function handleSelect(id: string | null) {
    setSelectedIds(id ? [id] : []);
    // Chọn/kéo vào 1 component KHÔNG tự mở panel nếu đang bị ẩn thủ công (nút toggle nổi/✕) — chỉ
    // người dùng bấm đúng nút toggle mới mở lại được, tránh panel tự bật ra ngoài ý muốn mỗi lần
    // click chọn khác. Panel ĐANG mở sẵn thì vẫn cập nhật theo lựa chọn mới như bình thường. Bỏ chọn
    // (click nền trống) vẫn tự ẩn — không có gì để sửa thì không có lý do giữ panel mở.
    if (id === null) setShowPanel(false);
  }

  // Ctrl (Windows)/Cmd (macOS) + click 1 component trên canvas — cộng vào vùng chọn nếu chưa có,
  // trừ ra nếu đã có (xem LandingCanvas.tsx's handleComponentMouseDown).
  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) setShowPanel(false);
      return next;
    });
  }

  // Kéo-thả xong khung marquee trên nền trống (xem LandingCanvas.tsx's handleWrapperMouseDown) —
  // `additive` (Ctrl/Cmd giữ lúc bắt đầu kéo) hợp vào vùng chọn cũ, ngược lại thay thế hẳn.
  function handleMarqueeSelect(ids: string[], additive: boolean) {
    setSelectedIds((prev) => {
      const next = additive ? Array.from(new Set([...prev, ...ids])) : ids;
      if (next.length === 0) setShowPanel(false);
      return next;
    });
  }

  function handleTogglePageSettings() {
    // `selectedIds.length === 0` (không phải chỉ `!selected`) — multi-select cũng có `selected` rỗng
    // nhưng panel lúc đó đang hiện "N selected" chứ không phải Background, bấm nút này phải CHUYỂN
    // sang Background (xoá vùng chọn) chứ không phải chỉ đóng panel.
    if (showPanel && selectedIds.length === 0) {
      setShowPanel(false);
    } else {
      setSelectedIds([]);
      setShowPanel(true);
    }
  }

  function handleChangeBackground(patch: Partial<BackgroundConfig>) {
    updateConfig(
      (prev) => ({
        ...prev,
        canvas: { ...prev.canvas, background: { ...prev.canvas.background, ...patch } },
      }),
      { label: "Edited background" }
    );
  }

  // `opts.commit` truyền `true` cho các lần gọi RỜI RẠC (vd toggle ẩn/hiện layer) — mặc định (kéo-thả/
  // resize trên canvas, bắn liên tục mỗi mousemove) để trống, tự gộp theo thời gian.
  function handleUpdateComponent(id: string, patch: Partial<LandingComponent>, opts?: { commit?: boolean }) {
    const target = config?.components.find((c) => c.id === id);
    const name = labelForComponent(target);
    const label =
      "hiddenInBuilder" in patch
        ? `Toggled visibility of ${name}`
        : "width" in patch || "height" in patch
          ? `Resized ${name}`
          : "x" in patch || "y" in patch
            ? `Moved ${name}`
            : `Edited ${name}`;
    updateConfig(
      (prev) => ({
        ...prev,
        components: prev.components.map((c) =>
          c.id === id ? fitDigitRollerHeight({ ...c, ...patch } as LandingComponent) : c
        ),
      }),
      { commit: opts?.commit, label }
    );
  }

  // orderedIds: thứ tự TRƯỚC → SAU do LayersPanel.tsx tính ra sau khi kéo-thả (phần tử đầu = lớp
  // trước cùng) — quy đổi thành zIndex thật (đầu mảng nhận zIndex CAO NHẤT, khớp đúng quy ước
  // "zIndex cao hơn = vẽ sau = nằm trên" đã dùng sẵn ở LandingRenderer.tsx).
  function handleReorderLayers(orderedIds: string[]) {
    updateConfig(
      (prev) => ({
        ...prev,
        components: prev.components.map((c) => {
          const idx = orderedIds.indexOf(c.id);
          return idx === -1 ? c : { ...c, zIndex: orderedIds.length - 1 - idx };
        }),
      }),
      { commit: true, label: "Reordered layers" }
    );
  }

  function handleUpdateProps(patch: Record<string, any>) {
    // Form riêng theo type chỉ render khi chọn ĐÚNG 1 component (xem PropertiesPanel.tsx) nên hàm
    // này không bao giờ được gọi khi đang multi-select — guard lại cho chắc.
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    const label = `Edited ${labelForComponent(config?.components.find((c) => c.id === id))}`;
    updateConfig(
      (prev) => ({
        ...prev,
        components: prev.components.map((c) =>
          c.id === id ? fitDigitRollerHeight({ ...c, props: { ...c.props, ...patch } } as LandingComponent) : c
        ),
      }),
      { label }
    );
  }

  // Cập nhật nhóm "focus" (nhóm DUY NHẤT chứa scaleUp) ở ĐÚNG 1 stage — dùng chung cho cả điểm neo
  // (directionX/Y) lẫn điểm Direction (handleX/Y, xem doc-comment PrizeGroupEffect trong types.ts),
  // gọi liên tục mỗi lần kéo (không `commit`, tự gộp theo thời gian như handleUpdateComponent lúc
  // kéo-di-chuyển, xem doc-comment đầu useConfigHistory.ts) từ ScaleAnchorOverlay.tsx (kéo-thả THẬT SỰ
  // diễn ra ở canvas, xem LandingCanvas.tsx's renderAnchorOverlay). Không dùng lại handleUpdateProps ở
  // trên vì patch ở đây LỒNG SÂU hơn 1 cấp (props.<stageKey>.focus.<field>, không phải field phẳng
  // ngay dưới props) — cần tự đọc + fallback riêng từng cấp giống PrizeEffectPicker.tsx.
  function handleUpdateAnchor(stageKey: AnchorEditTarget["stageKey"], patch: Partial<PrizeGroupEffect>) {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    updateConfig(
      (prev) => ({
        ...prev,
        components: prev.components.map((c) => {
          if (c.id !== id) return c;
          const props: any = c.props;
          const stage = props[stageKey] ?? DEFAULT_PRIZE_STAGE_EFFECT;
          const focus = stage.focus ?? DEFAULT_PRIZE_GROUP_EFFECT;
          return {
            ...c,
            props: { ...props, [stageKey]: { ...stage, focus: { ...focus, ...patch } } },
          } as LandingComponent;
        }),
      }),
      { label: "Edited anchor point" }
    );
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

    // Không bắt buộc tên duy nhất (không còn Trigger Graph cần phân biệt) — vẫn tự đặt tên rảnh đầu
    // tiên ("Button", "Button 2", "Button 3"...) cho dễ nhận diện trong LayersPanel khi trang có
    // nhiều Button.
    if (type === "button") {
      const usedNames = new Set(
        (config?.components ?? [])
          .filter((c): c is ButtonComponent => c.type === "button")
          .map((c) => c.name?.trim())
      );
      let name = "Button";
      for (let n = 2; usedNames.has(name); n++) name = `Button ${n}`;
      updateConfig(
        (prev) => {
          const component = createComponentAt(type, x, y, prev.components.length) as ButtonComponent;
          component.name = name;
          setSelectedIds([component.id]);
          setShowPanel(true);
          return { ...prev, components: [...prev.components, component] };
        },
        { commit: true, label: `Added ${COMPONENT_REGISTRY[type].label}` }
      );
      setShowAddFlyout(false);
      return;
    }

    updateConfig(
      (prev) => {
        const component = createComponentAt(type, x, y, prev.components.length);
        setSelectedIds([component.id]);
        setShowPanel(true);
        return { ...prev, components: [...prev.components, component] };
      },
      { commit: true, label: `Added ${COMPONENT_REGISTRY[type].label}` }
    );
    setShowAddFlyout(false);
  }

  // Xoá TẤT CẢ component đang được chọn (đơn hoặc nhiều — Ctrl/Cmd+click, marquee) cùng lúc.
  function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    const label =
      selectedIds.length === 1
        ? `Deleted ${labelForComponent(config?.components.find((c) => c.id === selectedIds[0]))}`
        : `Deleted ${selectedIds.length} components`;
    updateConfig(
      (prev) => ({ ...prev, components: prev.components.filter((c) => !selectedIds.includes(c.id)) }),
      { commit: true, label }
    );
    setSelectedIds([]);
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

  // Huỷ TOÀN BỘ thay đổi chưa lưu — quay lại đúng bản đã Save gần nhất. Không thể hoàn tác nên luôn
  // hỏi xác nhận trước, đúng quy ước đã dùng cho các thao tác phá huỷ khác trong app (vd Reset
  // Session). Áp lại fitDigitRollerHeight + lọc component type không còn hợp lệ, giống hệt lúc mới
  // mở Builder (xem effect load session ở trên), để khớp đúng bất biến "auto-fit height" và không
  // tái xuất hiện component type cũ đã bỏ nếu bản Save gần nhất còn lưu chúng.
  function handleDiscard() {
    if (!window.confirm("Discard all unsaved changes? This cannot be undone.")) return;
    const reverted = JSON.parse(savedConfigRef.current) as LandingConfig;
    const known = reverted.components.filter((c) => !!COMPONENT_REGISTRY[c.type]);
    history.reset({ ...reverted, components: known.map(fitDigitRollerHeight) });
    setSelectedIds([]);
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
          {/* Undo/Redo + History — xem useConfigHistory.ts. Đặt tách biệt khỏi cụm Discard/Save (nút
              phá huỷ/ghi DB thật) bằng 1 vạch chia, tránh bấm nhầm. */}
          <div className="flex items-center gap-1">
            <button
              onClick={history.undo}
              disabled={!history.canUndo}
              title="Undo (Ctrl/Cmd+Z)"
              className={headerIconBtn}
            >
              <UndoIcon />
            </button>
            <button
              onClick={history.redo}
              disabled={!history.canRedo}
              title="Redo (Ctrl/Cmd+Shift+Z)"
              className={headerIconBtn}
            >
              <RedoIcon />
            </button>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowHistory((v) => !v)}
                title="History"
                className={`${headerIconBtn} w-auto gap-1 px-2 text-xs ${showHistory ? "bg-base-800 text-base-100" : ""}`}
              >
                <HistoryIcon />
                {history.historyLabels.length}
              </button>
              {showHistory && (
                <div className="absolute right-0 z-30 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-base-700 bg-base-900 p-2 text-xs shadow-2xl">
                  {history.historyLabels.length === 0 ? (
                    <span className="block px-2 py-1 text-base-500">No actions yet.</span>
                  ) : (
                    <ol className="space-y-0.5">
                      {history.historyLabels.map((label, i) => (
                        <li key={i}>
                          <button
                            className="block w-full rounded px-2 py-1 text-left text-base-200 hover:bg-base-800"
                            onClick={() => {
                              history.jumpTo(i + 1);
                              setShowHistory(false);
                            }}
                            title="Roll back to right after this step"
                          >
                            {i + 1}. {label}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="h-5 w-px bg-base-800" />
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
        <LandingCanvas
          config={config}
          data={landingData}
          selectedIds={selectedIds}
          showGrid={showGrid}
          tool={tool}
          zoom={zoom}
          onZoomChange={(updater) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, updater(z))))}
          onSelect={handleSelect}
          onToggleSelect={handleToggleSelect}
          onMarqueeSelect={handleMarqueeSelect}
          onUpdateComponent={handleUpdateComponent}
          onDropNewComponent={handleDropNewComponent}
          anchorEdit={anchorEdit}
          onUpdateAnchor={handleUpdateAnchor}
          onDoneAnchorEdit={() => setAnchorEdit((prev) => (prev ? { ...prev, mode: "locked" } : prev))}
          onAnchorPlaced={() => setAnchorEdit((prev) => (prev ? { ...prev, mode: "editing" } : prev))}
        />

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

        {/* Toolbar nổi bên trái — Select/Hand tool + Gridline, Add component, Layers, Page settings. */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <ToolbarTooltip label="Select tool" shortcut="V">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTool("select");
              }}
              aria-label="Select tool (V)"
              className={`${floatingBtn} ${tool === "select" ? floatingBtnActive : floatingBtnIdle}`}
            >
              <SelectIcon />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label={zoom <= MIN_ZOOM ? "Hand tool needs zooming in first" : "Hand tool"} shortcut="H">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (zoom > MIN_ZOOM) setTool("hand");
              }}
              disabled={zoom <= MIN_ZOOM}
              aria-label={
                zoom <= MIN_ZOOM
                  ? "Hand tool needs zooming in first — the page already fits the screen"
                  : "Hand tool (H) — hold to pan"
              }
              className={`${floatingBtn} ${
                zoom <= MIN_ZOOM ? floatingBtnDisabled : tool === "hand" ? floatingBtnActive : floatingBtnIdle
              }`}
            >
              <HandIcon />
            </button>
          </ToolbarTooltip>

          <div className="h-px bg-base-800" />

          <ToolbarTooltip label="Toggle gridlines" shortcut="G">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowGrid((v) => !v);
              }}
              aria-label="Toggle gridlines (G)"
              className={`${floatingBtn} ${showGrid ? floatingBtnActive : floatingBtnIdle}`}
            >
              <GridIcon />
            </button>
          </ToolbarTooltip>

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
                  selectedId={selected?.id ?? null}
                  onSelect={handleSelect}
                  onToggleHidden={(id) => {
                    const c = config.components.find((c) => c.id === id);
                    if (c) handleUpdateComponent(id, { hiddenInBuilder: !c.hiddenInBuilder }, { commit: true });
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
            className={`${floatingBtn} ${showPanel && selectedIds.length === 0 ? floatingBtnActive : floatingBtnIdle}`}
          >
            <BackgroundIcon />
          </button>
        </div>

        {/* Chỉ báo mức zoom + nút +/- nổi góc dưới trái — cách chính vẫn là cuộn chuột/pinch trackpad
            ngay trên canvas (xem onZoomChange trong LandingCanvas.tsx) hoặc Ctrl/Cmd +/-, cụm này chỉ
            để biết đang ở mức nào và có lối bấm chuột thay thế. */}
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
                {selectedIds.length > 1
                  ? `${selectedIds.length} components selected`
                  : selected
                    ? selected.type.replace(/([A-Z])/g, " $1")
                    : "Page settings"}
              </span>
              <button onClick={() => setShowPanel(false)} className="text-base-500 hover:text-base-200">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              <PropertiesPanel
                config={config}
                selected={selected}
                selectedCount={selectedIds.length}
                sessionName={session.name}
                prizes={prizes}
                participants={participants}
                onChangeBackground={handleChangeBackground}
                onChangeComponent={(patch) => selected && handleUpdateComponent(selected.id, patch)}
                onChangeProps={handleUpdateProps}
                onDelete={handleDeleteSelected}
                anchorEdit={anchorEdit}
                onSetAnchorEdit={setAnchorEdit}
              />
            </div>
          </div>
        )}

        {/* Tab nổi để mở lại Properties Panel sau khi đã tạm ẩn (nút ✕ ở trên chỉ ẩn, không xoá
            lựa chọn) — không cần click lại đúng component trên canvas, tránh phải rà đúng vị trí
            khi nó vừa bị khung panel che mất. Luôn hiện khi panel đang ẩn, kể cả chưa chọn gì (bấm
            vào sẽ mở lại đúng Page settings, giống hành vi mặc định của PropertiesPanel). */}
        {!showPanel && (
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

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M8 7 3 12l5 5" />
      <path d="M3 12h11a6 6 0 0 1 0 12h-2" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M16 7l5 5-5 5" />
      <path d="M21 12H10a6 6 0 0 0 0 12h2" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
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
