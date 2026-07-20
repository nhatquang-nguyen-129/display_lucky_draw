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

interface BaseComponent {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number; // thứ tự append — v1 chưa có UI đổi z-index thủ công
  effect: EffectName;
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

/** Field của Participant dùng để nhận diện 1 người (không hiển thị id thô). */
export type ParticipantKeyField = "participantId" | "code" | "phone" | "email";
/** Field của Participant dùng để HIỂN THỊ (không bao giờ hiện participantId thô). */
export type ParticipantDisplayField = "name" | "phone" | "email" | "code";

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
  | ParticipantCountComponent;

export type LandingComponentType = LandingComponent["type"];

export interface BackgroundConfig {
  type: "color" | "image";
  color: string; // hex — luôn có, dùng làm màu viền letterbox khi type = "image" không phủ hết khung
  imageDataUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
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

/** Đọc 1 field của Participant theo tên field logic dùng trong LuckyWheelProps (không bao giờ null). */
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
