// Landing Page Builder — kiểu dữ liệu trung tâm. Toàn bộ layout của 1 landing page là 1 object
// LandingConfig duy nhất, lưu nguyên dạng JSON trong cột sessions.landing_config (đã có sẵn migration).
// Builder chỉ sửa object này; PresentMode chỉ render object này — không có state nào khác ở giữa.
//
// Thêm 1 loại component mới cần đúng 4 bước (không cần sửa chỗ nào khác):
//   1. Thêm interface `XxxProps` + variant `XxxComponent` vào union `LandingComponent` bên dưới.
//   2. Thêm `src/components/landing/views/XxxView.tsx` (chỉ render, nhận `props` + `LandingData`).
//   3. Thêm `src/components/landing/panels/XxxPanel.tsx` (form cấu hình trong Properties Panel).
//   4. Đăng ký trong `src/components/landing/componentRegistry.ts` — đây là chỗ DUY NHẤT "nối dây"
//      loại mới vào palette (kéo-thả) và canvas (tạo instance mặc định khi thả).

export type EffectName = "none" | "fadeIn" | "slideUp" | "pulse" | "bounce";

export const EFFECT_NAMES: EffectName[] = ["none", "fadeIn", "slideUp", "pulse", "bounce"];

// Trigger = đúng 3 hành động Button hỗ trợ (xem ButtonProps ở dưới) — không có trigger tự đặt tên
// tuỳ ý ở v1. Reaction = 1 hiệu ứng nhỏ, khai báo (không phải CSS tuỳ ý) mà BẤT KỲ component nào
// (và cả canvas background — xem BackgroundConfig) có thể đăng ký để "phản ứng" theo trigger đó,
// sau 1 khoảng delay, giữ trong 1 khoảng duration rồi tự trả về bình thường (0 = giữ tới khi có
// trigger tiếp theo). Đây là tính năng generic được yêu cầu — thêm reaction mới cho 1 component
// chỉ là thêm 1 phần tử vào mảng `reactions`, không cần code riêng cho từng cặp component/trigger.
export type LandingTriggerEvent = "draw" | "confirm" | "redo";

export interface EffectReaction {
  id: string;
  trigger: LandingTriggerEvent;
  delayMs: number; // chờ bao lâu sau khi trigger nổ ra mới áp hiệu ứng
  durationMs: number; // giữ hiệu ứng bao lâu trước khi tự trả về bình thường; 0 = giữ tới trigger kế tiếp
  dim?: number; // 0-1 — phủ đen mờ dần lên trên
  scale?: number; // hệ số phóng to tại chỗ, vd 1.15
  glow?: boolean; // thêm viền sáng
  glowColor?: string;
}

export function newReactionId(): string {
  return `reaction-${Math.random().toString(36).slice(2, 10)}`;
}

interface BaseComponent {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number; // thứ tự append — v1 chưa có UI đổi z-index thủ công
  effect: EffectName;
  reactions?: EffectReaction[]; // opt-in — rỗng/undefined nghĩa là component không phản ứng gì với trigger
}

export interface TextProps {
  content: string;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
}

export interface ImageProps {
  srcDataUrl: string | null; // base64, giống cách PrizeFormModal lưu display_image
  fit: "cover" | "contain" | "stretch";
  borderRadius: number;
}

export interface TextComponent extends BaseComponent {
  type: "text";
  props: TextProps;
}

export interface ImageComponent extends BaseComponent {
  type: "image";
  props: ImageProps;
}

// `(string & {})` giữ gợi ý autocomplete cho các giá trị cố định bên dưới nhưng vẫn cho phép bất kỳ
// chuỗi nào khác — đó là tên 1 cột optional (extra_data) do người dùng tự thêm ở Data Editor (xem
// getParticipantField). Field của Participant dùng để nhận diện 1 người (không hiển thị id thô).
export type ParticipantKeyField = "participantId" | "code" | "phone" | "email" | (string & {});
/** Field của Participant dùng để HIỂN THỊ (không bao giờ hiện participantId thô) — cố định hoặc cột optional. */
export type ParticipantDisplayField = "name" | "phone" | "email" | "code" | (string & {});

// "Template" của Lucky Wheel — cùng 1 cơ chế binding (session/field/mask/spin), chỉ khác cách VẼ.
// Thêm template mới: thêm giá trị vào union này + 1 file trong components/landing/luckyWheelTemplates/
// + 1 case trong LuckyWheelView.tsx (xem comment ở đầu file đó) — không đụng gì tới phần binding.
export type LuckyWheelTemplate = "wheel" | "digitRoller";

export interface LuckyWheelProps {
  template: LuckyWheelTemplate;
  // Data binding — luôn đọc từ chính session sở hữu landing page này (xem useLandingData),
  // KHÔNG có picker chọn session khác để giữ đúng nguyên tắc mỗi tab độc lập hoàn toàn.
  drawField: ParticipantKeyField; // field dùng để gom nhóm/khử trùng các segment — chỉ dùng cho template "wheel"
  displayField: ParticipantDisplayField; // chữ hiển thị trên từng segment lúc quay — chỉ dùng cho template "wheel"
  winnerDisplayField: ParticipantDisplayField; // field nguồn cho kết quả công bố (wheel: tên hiện ra; digitRoller: rút số từ field này)
  maskSensitiveData: boolean; // áp dụng maskPhone() có sẵn khi field hiển thị là "phone" — chỉ dùng cho template "wheel"
  digitCount: number; // số ký tự số hiện ở cuối — chỉ dùng cho template "digitRoller", vd 3 → "0917xxx892" hiện "892"
  // 3 trục cấu hình ĐỘC LẬP cho animation của template "digitRoller" (không gộp thành 1 "style" tổ
  // hợp sẵn) — mỗi trục tự do kết hợp với 2 trục còn lại. Field không tồn tại ở config cũ (trước khi
  // có các tính năng này) → code đọc luôn tự fallback về giá trị tái tạo ĐÚNG hành vi gốc ban đầu
  // (flicker + together + none), không đổi hành vi của landing đã lưu trước đó.
  //
  // Trục 1 — cơ chế hiển thị lúc 1 ô CHƯA chốt xong:
  // "flicker" = đổi ký tự ngẫu nhiên liên tục theo nhịp (nhịp tự chậm dần theo spinEasing khi tới
  // lượt chốt), giống máy đánh số cũ. "reel" = cuộn dọc liên tục kiểu bánh xe ký tự/odometer thật,
  // ký tự rơi từ trên xuống, tự dừng đúng vị trí ký tự thật bằng CSS transition.
  rollStyle: "flicker" | "reel";
  // Sub-setting của rollStyle "reel" (KHÔNG phải landingEffect) — có nảy nhẹ kiểu vật lý (overshoot)
  // lúc dừng hay dừng êm không nảy. Chỉ có ý nghĩa khi rollStyle = "reel".
  reelBounce: boolean;
  // Trục 2 — thời điểm các ô CHUYỂN SANG PHA CHỐT (settling — bắt đầu giảm tốc dần rồi dừng ở ký tự
  // thật): "together" = mọi ô vào pha chốt ngay t=0 (chốt cùng lúc, cùng giảm tốc). "sequential" =
  // ô thứ i CHỈ bắt đầu giảm tốc SAU KHI ô (i-1) đã dừng hẳn + revealStaggerMs — trong lúc chờ tới
  // lượt, ô đó vẫn nhấp nháy/cuộn NHANH BÌNH THƯỜNG (không giảm tốc theo ô đang chốt).
  revealTiming: "together" | "sequential";
  // Chỉ có tác dụng khi revealTiming = "sequential" — khoảng nghỉ (ms) SAU KHI ô này đã dừng hẳn,
  // trước khi ô kế tiếp bắt đầu giảm tốc.
  revealStaggerMs: number;
  // Trục 3 — hiệu ứng 1 LẦN ngay khi 1 ô vừa chốt xong ký tự thật, CHỈ áp dụng cho rollStyle
  // "flicker" (rollStyle "reel" dùng reelBounce riêng ở trên, không dùng field này): "none" = dừng
  // luôn. "bounce" = rơi xuống + nảy nhẹ. "pop" = phóng to 1 chút rồi thu về kích thước ban đầu.
  landingEffect: "none" | "bounce" | "pop";
  fontFamily: string;
  fontColor: string;
  fontSize: number;
  spinDurationMs: number;
  spinEasing: "linear" | "easeOut" | "easeInOut";
  // v1 chỉ hỗ trợ đúng 1 hành vi: luôn dừng ở người trúng thật do Draw Engine trả về — không có
  // chế độ quay "chơi" không gắn với kết quả thật. Giữ field lại để sau này có chỗ mở rộng.
  autoStop: true;
}

export interface LuckyWheelComponent extends BaseComponent {
  type: "luckyWheel";
  props: LuckyWheelProps;
}

// winnerName/prizeName dùng chung 1 shape props (và chung 1 PropertiesPanel form — LiveTextPanel)
// vì chỉ khác nhau ở NGUỒN dữ liệu đọc (participant_name vs prize_name), không khác về cấu hình.
export interface LiveTextProps {
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
  fallbackText: string; // hiện khi chưa có lượt quay nào
}

export interface LiveImageProps {
  fit: "cover" | "contain" | "stretch";
  borderRadius: number;
  fallbackImageDataUrl: string | null;
}

export interface PrizeListProps {
  fontSize: number;
  color: string;
  showRemaining: boolean;
}

export interface WinnerNameComponent extends BaseComponent {
  type: "winnerName";
  props: LiveTextProps;
}

export interface PrizeNameComponent extends BaseComponent {
  type: "prizeName";
  props: LiveTextProps;
}

export interface PrizeImageComponent extends BaseComponent {
  type: "prizeImage";
  props: LiveImageProps;
}

export interface PrizeListComponent extends BaseComponent {
  type: "prizeList";
  props: PrizeListProps;
}

export interface CountdownProps {
  targetIsoTime: string | null; // ISO datetime — null = chưa đặt, hiện placeholder
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  completedText: string; // hiện khi đã qua targetIsoTime
}

export interface CurrentTimeProps {
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  format: "24h" | "12h";
}

export interface ParticipantCountProps {
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  label: string; // vd "Participants:"
  // "remainingEligible" là gần đúng (participants CHƯA xuất hiện trong bất kỳ draw_results nào của
  // session) — không tái tạo đầy đủ luật loại trừ theo từng giải của drawEngine.ts, chỉ để hiển thị.
  mode: "total" | "remainingEligible";
}

export interface CountdownComponent extends BaseComponent {
  type: "countdown";
  props: CountdownProps;
}

export interface CurrentTimeComponent extends BaseComponent {
  type: "currentTime";
  props: CurrentTimeProps;
}

export interface ParticipantCountComponent extends BaseComponent {
  type: "participantCount";
  props: ParticipantCountProps;
}

// Button tương tác — CHỈ hoạt động thật trong Present Mode (LandingRenderer interactive=true).
// Trong Builder canvas nó vẫn hiện ra nhưng luôn disabled, tránh bấm nhầm chạy quay số thật lúc
// đang chỉnh sửa. "draw" gọi draw:pick (chưa ghi DB) — "confirm" gọi draw:commit cho candidate
// đang hiện — "redo" loại candidate đang hiện rồi pick lại ĐÚNG giải đó (xem useDrawSequence.ts).
// "openLink" mở URL lấy từ 1 cột optional đã được gán Loại dữ liệu "url" (ở Data Editor) của
// CHÍNH participant vừa trúng (candidate đang hiện) — không liên quan gì tới draw/confirm/redo,
// chỉ cần đã có người trúng để tra dữ liệu.
export type ButtonAction = "draw" | "confirm" | "redo" | "openLink";

export interface ButtonProps {
  action: ButtonAction;
  label: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  borderRadius: number;
  strokeColor: string;
  strokeWidth: number; // 0 = không viền
  // Chỉ dùng cho action "openLink" — tên cột optional (trong Participant.extra_data) đã được gán
  // Loại dữ liệu "url" ở Data Editor. undefined/rỗng nghĩa là chưa chọn — nút sẽ disabled.
  urlField?: string;
}

export interface ButtonComponent extends BaseComponent {
  type: "button";
  props: ButtonProps;
}

export type LandingComponent =
  | TextComponent
  | ImageComponent
  | LuckyWheelComponent
  | WinnerNameComponent
  | PrizeNameComponent
  | PrizeImageComponent
  | PrizeListComponent
  | CountdownComponent
  | CurrentTimeComponent
  | ParticipantCountComponent
  | ButtonComponent;

export type LandingComponentType = LandingComponent["type"];

export interface BackgroundConfig {
  type: "color" | "image";
  color: string; // hex — luôn có, dùng làm màu viền letterbox khi type = "image" không phủ hết khung
  imageDataUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
  reactions?: EffectReaction[]; // canvas background cũng là 1 "đối tượng" phản ứng được theo trigger
}

export interface LandingConfig {
  version: 1;
  canvas: {
    width: number; // cố định 1920 ở v1
    height: number; // cố định 1080 ở v1 (16:9)
    background: BackgroundConfig;
  };
  components: LandingComponent[];
}

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  version: 1,
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    background: { type: "color", color: "#FFFFFF" },
  },
  components: [],
};

/** Parse an toàn — bất kỳ lỗi/thiếu field nào cũng rơi về config rỗng thay vì crash Builder/Present Mode. */
export function parseLandingConfig(raw: string | null): LandingConfig {
  if (!raw) return DEFAULT_LANDING_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.components) && parsed.canvas) {
      return parsed as LandingConfig;
    }
    return DEFAULT_LANDING_CONFIG;
  } catch {
    return DEFAULT_LANDING_CONFIG;
  }
}

export function newComponentId(): string {
  return `comp-${Math.random().toString(36).slice(2, 10)}`;
}

/** Đọc 1 field của Participant theo tên field logic dùng trong LuckyWheelProps (không bao giờ null).
 * Field không khớp 1 trong 5 tên cố định được coi là tên cột optional (extra_data) — tra qua
 * getParticipantExtraField, rỗng nếu participant không có cột đó (xem LuckyWheelPanel.tsx, nơi
 * liệt kê cả cột optional cho người dùng chọn, không chỉ 4 field cố định như trước). */
export function getParticipantField(
  p: import("@/types").Participant,
  field: ParticipantKeyField | "name"
): string {
  switch (field) {
    case "participantId":
      return p.id;
    case "name":
      return p.name;
    case "code":
      return p.code ?? "";
    case "phone":
      return p.phone ?? "";
    case "email":
      return p.email ?? "";
    default:
      return getParticipantExtraField(p, field) ?? "";
  }
}

/** Đọc 1 cột optional trong Participant.extra_data theo tên — dùng cho Button action "openLink"
 * tra URL của người vừa trúng. Trả về null nếu chưa chọn cột, participant không có cột đó, hoặc
 * giá trị rỗng — ButtonView dựa vào null để tự disable, không hiện link rỗng/hỏng. */
export function getParticipantExtraField(p: import("@/types").Participant, field: string | undefined): string | null {
  if (!field || !p.extra_data) return null;
  try {
    const extra = JSON.parse(p.extra_data) as Record<string, string>;
    const value = extra[field];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

// Gói dữ liệu sống (participants/prizes/kết quả quay) — 1 nơi fetch/poll duy nhất
// (xem useLandingData.ts), truyền xuống mọi view "động" (luckyWheel, winnerName...) qua LandingRenderer.
// Text/Image ở Phase 1-2 không cần, nhưng chữ ký LandingRenderer nhận sẵn để các phase sau không
// phải đổi lại props của LandingRenderer.
export interface LandingData {
  participants: import("@/types").Participant[];
  prizes: import("@/types").Prize[];
  results: import("@/types").DrawResultRow[];
}

// Trạng thái + hành động của luồng Draw/Confirm/Redo — xem useDrawSequence.ts (nơi triển khai
// thật) và ButtonView.tsx (nơi tiêu thụ). Khai báo shape ở đây (lớp dữ liệu) thay vì để ButtonView
// import thẳng kiểu trả về của hook, giữ đúng phân lớp "views/ chỉ biết shape dữ liệu, không biết
// hook nào tạo ra nó".
export interface LastTrigger {
  event: LandingTriggerEvent;
  firedAt: number; // Date.now() tại lúc trigger nổ ra — dùng để tính delay/duration của reactions
}

export interface DrawSequenceActions {
  candidate: import("@/types").DrawCandidate | null;
  isPending: boolean; // đã pick nhưng chưa confirm — Draw bị khoá, Confirm/Redo mở
  busy: boolean; // đang có 1 lời gọi IPC dở dang — khoá cả 3 nút tránh bấm chồng
  error: string | null;
  lastTrigger: LastTrigger | null; // trigger gần nhất đã nổ ra thật (chỉ set khi IPC thành công)
  pick: () => void;
  confirm: () => void;
  redo: () => void;
}
