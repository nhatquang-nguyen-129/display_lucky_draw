// Landing Page Builder — kiểu dữ liệu trung tâm. Toàn bộ layout của 1 landing page là 1 object
// LandingConfig duy nhất, lưu nguyên dạng JSON trong cột sessions.landing_config (đã có sẵn migration).
// Builder chỉ sửa object này; PresentMode chỉ render object này — không có state nào khác ở giữa.
//
// Thêm 1 loại component mới cần đúng 5 bước (không cần sửa chỗ nào khác):
//   0. Xác định rõ nó là Signal EMITTER hay Signal RECEIVER trước khi code (xem CLAUDE.md) — đa số
//      component chỉ thuộc ĐÚNG 1 trong 2 nhóm. Emitter (Button, sau này QR Scanner/NFC Reader...)
//      người dùng thao tác trực tiếp ở Present Mode, CHỈ phát Event, không tự chạy business
//      logic/animation. Receiver (Lucky Wheel, Fireworks, Stage Light, Link Opener, Draw, Confirm
//      Winner, sau này Countdown/Scoreboard/Video...) người dùng KHÔNG thao tác trực tiếp được, CHỈ
//      nhận Command từ Trigger Graph rồi tự thực thi animation/logic của chính nó. NGOẠI LỆ HẸP: 1
//      Receiver có thời lượng hoàn thành KHÔNG cố định được phép thêm ĐÚNG 1 emit báo "xong việc"
//      (vd Lucky Wheel vừa listensFor "Wheel.StartSpin" vừa emits "Wheel.SpinCompleted"; Draw cùng
//      lý do — pick() là IPC bất đồng bộ — vừa listensFor "Draw.Pick" vừa emits "Draw.Picked") để
//      nối chuỗi hành động chính xác, không phải danh sách emit tự do. NGOẠI LỆ HẸP THỨ 2 — "gateable
//      Emitter": 1 Emitter được phép thêm listensFor ĐÚNG 2 Command "<Type>.Enable"/"<Type>.Disable"
//      (vd Button — xem ButtonProps/ButtonView.tsx) để Graph có thể khoá/mở nó theo 1 Signal bất kỳ,
//      KHÔNG đọc thêm bất kỳ state nghiệp vụ nào khác — vẫn là "vỏ rỗng", chỉ nhớ đúng 1 boolean do
//      2 Command này set. Tên tín hiệu theo quy ước `Component.Action` (vd "Wheel.StartSpin",
//      "Fireworks.Play", "Button.Click", "Button.Enable").
//   1. Thêm interface `XxxProps` + variant `XxxComponent` vào union `LandingComponent` bên dưới.
//   2. Thêm `src/components/landing/views/XxxView.tsx` (chỉ render, nhận `props` + `LandingData`).
//   3. Thêm `src/components/landing/panels/XxxPanel.tsx` (form cấu hình trong Properties Panel).
//   4. Đăng ký trong `src/components/landing/componentRegistry.ts` — đây là chỗ DUY NHẤT "nối dây"
//      loại mới vào palette (kéo-thả) và canvas (tạo instance mặc định khi thả), CŨNG là nơi khai
//      báo `COMPONENT_SIGNALS` (emits/listensFor) cho bước 0 ở trên.

export type EffectName = "none" | "fadeIn" | "slideUp" | "pulse" | "bounce";

export const EFFECT_NAMES: EffectName[] = ["none", "fadeIn", "slideUp", "pulse", "bounce"];

// 1 liên kết trên Trigger Graph: khi component `sourceComponentId` phát tín hiệu `sourceSignal`
// (xem COMPONENT_SIGNALS trong componentRegistry.ts — vd Button luôn phát "Button.Click"), sau
// `delayMs` thì gửi tín hiệu `command` cho ĐÚNG 1 component (xem BaseComponent.triggerActions bên
// dưới — link này nằm trên component NHẬN lệnh, không phải component phát). Cả `sourceSignal` lẫn
// `command` đều tra hợp lệ qua COMPONENT_SIGNALS (emits của nguồn, listensFor của đích — vd Lucky
// Wheel hiểu "Wheel.StartSpin", Fireworks/Stage Light hiểu "Fireworks.Play"/"StageLight.Play") —
// mỗi loại component tự khai báo sẵn tín hiệu nó phát/hiểu, không phải tên tự đặt tuỳ ý. Graph
// không biết tín hiệu đó LÀM GÌ — logic đó nằm hoàn toàn trong runtime của chính component nhận
// lệnh (xem useTriggerCommands.ts). `sourceSignal` hiện luôn suy ra được 1-1 từ type của nguồn
// (Button chỉ có đúng 1 emit) nhưng vẫn lưu tường minh để khớp đúng 1 signal chip cụ thể trên
// Trigger Graph (xem SignalChipNode.tsx) — không phải dò lại qua type mỗi lần.
export interface TriggerAction {
  id: string;
  sourceComponentId: string;
  sourceSignal: string;
  delayMs: number;
  command: string;
}

export function newTriggerActionId(): string {
  return `trigger-action-${Math.random().toString(36).slice(2, 10)}`;
}

interface BaseComponent {
  id: string;
  // Tên hiển thị do người dùng tự đặt (optional) — dùng để nhận diện component trên Trigger Graph
  // (TriggerGraphEditor.tsx) khi trang có nhiều component CÙNG loại (vd 2 Button đều tên "Button"
  // nếu không đặt tên riêng thì không phân biệt được trên graph). Rỗng/undefined thì graph tự dùng
  // nhãn loại component (vd "Button", "Text") làm fallback — xem SharedFields.tsx (nơi sửa) và
  // targetLabelOf() trong TriggerGraphEditor.tsx (nơi đọc).
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number; // thứ tự trước/sau — sửa được qua kéo-thả trong LayersPanel.tsx (xem onReorder)
  effect: EffectName;
  // Các liên kết Trigger Graph NHẬN lệnh về component này (xem TriggerAction ở trên) — opt-in,
  // rỗng/undefined nghĩa là chưa có trigger nào điều khiển component này. Component tự đọc mảng
  // này của CHÍNH NÓ qua useTriggerCommands.ts để biết khi nào Play/Stop.
  triggerActions?: TriggerAction[];
  // Tạm ẩn khỏi canvas Builder (cả phần vẽ lẫn khung chọn/kéo-thả) — bật/tắt qua LayersPanel.tsx.
  // CHỈ ảnh hưởng Builder — Present Mode luôn bỏ qua field này hoàn toàn (không đọc ở bất kỳ đâu
  // trong PresentMode.tsx/LandingRenderer.tsx khi interactive=true), nên lưu vào config vẫn an toàn
  // tuyệt đối, không bao giờ làm đổi những gì khán giả nhìn thấy lúc trình chiếu thật.
  hiddenInBuilder?: boolean;
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
  // Sub-setting của rollStyle "reel" (KHÔNG phải landingEffect, chỉ có ý nghĩa khi rollStyle =
  // "reel") — 1 ô số hình dung gồm 2 PHẦN TÁCH BIỆT: khung trắng chứa ký tự, và CHÍNH ký tự bên
  // trong. Mỗi phần có hiệu ứng RIÊNG lúc vừa chốt, không gộp chung:
  // reelCardEffect — hiệu ứng cho KHUNG TRẮNG: "pop" = khung "bật ra" (scale+fade), tạo cảm giác
  // xuất hiện chớp nhoáng. Không đụng gì tới bản thân ký tự bên trong.
  reelCardEffect: "none" | "pop";
  // reelNumberEffect — hiệu ứng cho CHÍNH KÝ TỰ (không đụng khung): "bounce" = ký tự nảy lên nhẹ rồi
  // rơi xuống đúng vị trí giữa, kiểu quả bóng chạm đất, chỉ 1 nhịp nhỏ (không phải hiệu ứng của khung).
  reelNumberEffect: "none" | "bounce";
  // Trục 2 — thời điểm các ô CHUYỂN SANG PHA CHỐT (settling — bắt đầu giảm tốc dần rồi dừng ở ký tự
  // thật): "together" = mọi ô vào pha chốt ngay t=0 (chốt cùng lúc, cùng giảm tốc). "sequential" =
  // ô thứ i CHỈ bắt đầu giảm tốc SAU KHI ô (i-1) đã dừng hẳn + revealStaggerMs — trong lúc chờ tới
  // lượt, ô đó vẫn nhấp nháy/cuộn NHANH BÌNH THƯỜNG (không giảm tốc theo ô đang chốt).
  revealTiming: "together" | "sequential";
  // Chỉ có tác dụng khi revealTiming = "sequential" — khoảng nghỉ (ms) SAU KHI ô này đã dừng hẳn,
  // trước khi ô kế tiếp bắt đầu giảm tốc.
  revealStaggerMs: number;
  // Trục 3 — hiệu ứng 1 LẦN ngay khi 1 ô vừa chốt xong ký tự thật, CHỈ áp dụng cho rollStyle
  // "flicker" (rollStyle "reel" dùng reelCardEffect/reelNumberEffect riêng ở trên, không dùng field
  // này): "none" = dừng luôn. "bounce" = rơi xuống + nảy nhẹ. "pop" = phóng to 1 chút rồi thu về
  // kích thước ban đầu.
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

// Thêm template mới: thêm giá trị vào union này + 1 file trong components/landing/scoreboardTemplates/
// + 1 case trong ScoreboardView.tsx (đúng kiểu LuckyWheelView.tsx đang dispatch theo LuckyWheelTemplate).
export type ScoreboardTemplate = "table";

// Field nào cũng lấy được từ DrawResultRow (xem src/types.ts) — đây là danh sách CỐ ĐỊNH cho phép
// bật/tắt làm cột hiển thị, đúng tinh thần "vài lựa chọn dựng sẵn" như EFFECT_NAMES, không phải hệ
// thống cột tự do. Thứ tự trong mảng này CŨNG LÀ thứ tự cột mặc định khi bật.
export type ScoreboardField =
  | "participantName"
  | "participantCode"
  | "participantPhone"
  | "participantEmail"
  | "prizeName"
  | "prizeCode";

export const SCOREBOARD_FIELDS: ScoreboardField[] = [
  "participantName",
  "participantCode",
  "participantPhone",
  "participantEmail",
  "prizeName",
  "prizeCode",
];

export const SCOREBOARD_FIELD_LABELS: Record<ScoreboardField, string> = {
  participantName: "Name",
  participantCode: "Code",
  participantPhone: "Phone",
  participantEmail: "Email",
  prizeName: "Prize",
  prizeCode: "Prize code",
};

// Danh sách người đã trúng giải VÀ ĐÃ CONFIRM (draw_results thật — xem ScoreboardView.tsx, lọc bỏ
// dòng "pending-*" do useDrawSequence độn vào khi có candidate chưa Confirm, không tính là đã trúng
// thật). Danh sách có thể dài (nhiều lượt quay) nên bản thân component cuộn dọc bên trong khung cố
// định. KHÔNG tự hiện trên trang như các component khác — ẩn theo mặc định ở Present Mode, chỉ hiện
// ra giữa màn hình như 1 cửa sổ phụ khi 1 nút Button với action "showScoreboard" được bấm (xem
// ButtonView.tsx/useDrawSequence.ts cho state hiện/ẩn, LandingRenderer.tsx cho cách vẽ đè giữa màn
// hình). Trong Builder luôn hiện để còn chỉnh sửa được kích cỡ/màu sắc.
//
// Template "table" (đầu tiên): giao diện kiểu 1 cửa sổ Windows — Name Bar (title + titleBarColor +
// headerColor cho chữ) ở trên, bên dưới là bảng người trúng với cột tự chọn (columns, xem
// ScoreboardField) + nền riêng cho khung bảng (backgroundType/backgroundColor/backgroundImage...,
// cùng hệ thống với ParticipantCountProps — xem ParticipantCountPanel.tsx làm mẫu).
export interface ScoreboardProps {
  template: ScoreboardTemplate;

  title: string;
  titleBarColor: string; // màu NỀN của Name Bar
  headerColor: string; // màu CHỮ của Name Bar

  columns: ScoreboardField[]; // cột nào hiện + đúng thứ tự trái → phải
  fontSize: number;
  color: string; // màu chữ trong bảng (cả tiêu đề cột lẫn giá trị)

  // Nền riêng cho khung bảng (KHÔNG phải Name Bar) — "color" = 1 khối màu, "image" = ảnh tải lên,
  // "none" = trong suốt.
  backgroundType: "none" | "color" | "image";
  backgroundColor: string;
  backgroundImageDataUrl: string | null;
  backgroundImageFit: "cover" | "contain" | "stretch";
}

export interface ScoreboardComponent extends BaseComponent {
  type: "scoreboard";
  props: ScoreboardProps;
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

// Label và số đếm tách biệt hoàn toàn về style (font/size/màu riêng) — v1 gộp chung 1 fontSize/color
// duy nhất, đã tách ra theo yêu cầu. Field cũ (fontSize/color) KHÔNG còn trong type này nữa — config
// cũ đã lưu trước khi tách vẫn có 2 field đó trong JSON, đọc lại qua `(props as any).fontSize`/
// `.color` làm fallback ở View/Panel (đúng pattern đã dùng khi tách reelBounce → reelCardEffect/
// reelNumberEffect, xem DigitRollerTemplate.tsx) — không cần migration riêng, không đổi hiển thị của
// landing đã lưu trước đó.
export interface ParticipantCountProps {
  align: "left" | "center" | "right";
  label: string; // vd "Participants:"
  // "remainingEligible" là gần đúng (participants CHƯA xuất hiện trong bất kỳ draw_results nào của
  // session) — không tái tạo đầy đủ luật loại trừ theo từng giải của drawEngine.ts, chỉ để hiển thị.
  mode: "total" | "remainingEligible";

  labelFontFamily: string;
  labelFontSize: number;
  labelColor: string;

  countFontFamily: string;
  countFontSize: number;
  countColor: string;

  // Nền cho cả khung — "color" = 1 khối màu chữ nhật, "image" = ảnh tải lên, "none" = trong suốt
  // (giữ đúng hành vi cũ trước khi có field này).
  backgroundType: "none" | "color" | "image";
  backgroundColor: string; // dùng khi backgroundType = "color"
  backgroundImageDataUrl: string | null; // dùng khi backgroundType = "image"
  backgroundImageFit: "cover" | "contain" | "stretch";
  borderRadius: number; // bo góc nền — áp dụng cho cả "color" lẫn "image"
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

// Button — Signal EMITTER thuần (xem CLAUDE.md/checklist đầu file này) — CHỈ phát "Button.Click"
// khi được bấm ở Present Mode thật (LandingRenderer interactive=true; luôn disabled ở Builder canvas
// để tránh bấm nhầm lúc đang chỉnh sửa), KHÔNG tự chạy bất kỳ business logic nào (không gọi IPC,
// không biết Draw/Confirm/Redo/Reset/Open Link/Show Winner là gì — những action đó CHƯA có nơi nào
// lắng nghe "Button.Click" để thực thi lại, xem plan "Emitter/Receiver" — đây là điều CHỦ Ý, không
// phải thiếu sót). Không giới hạn số lượng Button/trang — tên (BaseComponent.name) là BẮT BUỘC và
// PHẢI DUY NHẤT giữa các Button trên cùng trang để phân biệt trên Trigger Graph (validate trong
// ButtonPanel.tsx, không phải ở đây).
//
// "GATEABLE EMITTER" — ngoại lệ hẹp THỨ 2 (khác hẳn ngoại lệ "báo xong việc" của Lucky Wheel/Draw ở
// checklist đầu file): Button vẫn là Emitter thuần (không đọc bất kỳ state nghiệp vụ nào, không biết
// Draw/Wheel/Confirm là gì) nhưng listensFor thêm ĐÚNG 2 Command chung "Button.Enable"/"Button.Disable"
// để 1 Signal bất kỳ trên Graph có thể tự do khoá/mở nó — vd "Wheel.SpinCompleted → Confirm.Enable"
// khiến nút Confirm chỉ bấm được SAU KHI quay xong (xem ButtonView.tsx). Button không hề biết TẠI SAO
// nó bị khoá/mở, chỉ nhớ đúng 1 boolean bật/tắt bởi 2 Command này — vẫn giữ nguyên tinh thần "vỏ rỗng,
// chỉ phản ứng theo dây đã nối" của toàn bộ Landing Builder, không phải Button "biết" business logic.
// `startEnabled` là trạng thái xuất phát TRƯỚC khi Command đầu tiên (nếu có) tới — false thì Button
// bắt đầu Present Mode ở trạng thái khoá sẵn, giống ví dụ Confirm ở trên. Đây là QUY ƯỚC CHUNG (không
// riêng Button) — Emitter tương lai nào cần gate cũng nên theo đúng khuôn `<Type>.Enable`/
// `<Type>.Disable`, xem CLAUDE.md.
export interface ButtonProps {
  label: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  borderRadius: number;
  strokeColor: string;
  strokeWidth: number; // 0 = không viền
  startEnabled: boolean; // trạng thái trước khi nhận Command "Button.Enable"/"Button.Disable" đầu tiên (nếu có wire)
}

export interface ButtonComponent extends BaseComponent {
  type: "button";
  props: ButtonProps;
}

// Component hiệu ứng đầu tiên (xem kiến trúc mới ở đầu file: hiệu ứng là Component thật, không phải
// field gắn kèm component khác) — hệ hạt canvas 2 pha kiểu pháo hoa thật (rocket bay lên để lại vệt
// sáng → nổ thành chùm tia toả tròn rồi tắt dần, xem FireworksView.tsx), không phải confetti rơi
// thẳng như bản đầu (từng là ConfettiBurst.tsx). Idle (không vẽ gì) cho tới khi nhận lệnh "play" qua
// useTriggerCommands.ts (đọc từ chính BaseComponent.triggerActions của component này).
export interface FireworksProps {
  preset: "burstCenter" | "rain" | "cannons"; // 1 quả giữa / bắn liên tục nhiều quả nhỏ / 2 quả 2 góc
  particleCount: number; // tổng số tia trong 1 lần nổ (rain chia nhỏ ra nhiều lần nổ)
  colorPalette: "brand" | "gold" | "rainbow";
  duration: number; // ms — độ dài 1 lượt Play (không loop) / 1 chu kỳ (loop)
  launchDirection: number; // độ — hướng bắn quả pháo (mặc định 0 = thẳng đứng) VÀ hướng chính của chùm tia lúc nổ
  launchHeight: number; // 0-1 — quả pháo bay lên cao bao nhiêu % chiều cao khung trước khi nổ, tách riêng khỏi speed/gravity để chỉnh trực tiếp
  spreadAngle: number; // độ — chùm tia toả rộng bao nhiêu quanh launchDirection (360 = toả tròn đều)
  burstRadius: number; // hệ số kích thước chùm nổ (40 = mặc định/chuẩn) — xem explode() trong FireworksView.tsx
  gravity: number; // trọng lực kéo tia rơi sau khi nổ — quả pháo lúc bay lên dùng riêng, luôn đủ để tới đỉnh rồi nổ
  speed: number; // tốc độ văng ra ban đầu của tia lúc nổ — KHÔNG còn ảnh hưởng độ cao bay lên (xem launchHeight)
  loop: boolean; // hết 1 lượt tự bắn lại (Play liên tục) hay tự về idle, chờ lệnh Play tiếp theo
}

export interface FireworksComponent extends BaseComponent {
  type: "fireworks";
  props: FireworksProps;
}

// Component hiệu ứng thứ 2 — đèn sân khấu quét CSS (không phải canvas particle như Fireworks), dùng
// đúng kỹ thuật "ghi transform trực tiếp vào ref mỗi khung hình" đã có ở DigitRollerTemplate.tsx thay
// vì qua state React mỗi frame. Idle = không render/không quay, cùng mô hình play/stop/loop với
// Fireworks (xem useTriggerCommands.ts).
export interface StageLightProps {
  beamColor: string;
  beamOpacity: number; // 0-1
  beamWidth: number; // độ rộng đáy chùm sáng (px, không gian thiết kế)
  beamLength: number; // độ dài chùm sáng (px)
  sweepAngle: number; // hướng trung tâm (độ, 0 = thẳng xuống)
  swingRange: number; // biên độ dao động quanh sweepAngle (độ) mỗi bên
  sweepSpeed: number; // giây/chu kỳ qua lại đầy đủ
  blurAmount: number; // px — filter: blur() cho viền chùm sáng
  intensity: number; // 0-1 — nhân thêm vào opacity, tổng độ sáng
  duration: number; // ms — độ dài 1 lượt Play khi loop=false
  loop: boolean; // quét liên tục (thường dùng) hay chỉ quét trong `duration` rồi tự về idle
}

export interface StageLightComponent extends BaseComponent {
  type: "stageLight";
  props: StageLightProps;
}

// Component hiệu ứng thứ 3 — 1 lớp phủ màu đơn giản, fade opacity qua CSS transition (không cần rAF
// gì cả, đơn giản hơn cả StageLight). Toggle nhị phân play/stop (tối dần lúc Play, sáng lại lúc
// Stop), không có duration/loop vì không có khái niệm "1 chu kỳ" — cứ giữ tối cho tới khi bị Stop.
// QUAN TRỌNG: đây KHÔNG phải 1 lớp đặc biệt "chỉ dim riêng nền" — nó dim TẤT CẢ những gì đang nằm
// DƯỚI nó theo đúng zIndex/Layers panel, giống hệt mọi component khác trong app (không có ngoại lệ
// z-order nào cho loại component này) — muốn giữ Wheel/Winner Name/Fireworks sáng trong lúc nền tối
// đi thì đặt chúng ở zIndex cao hơn Dim Background trong Layers panel.
export interface DimBackgroundProps {
  color: string; // hex — màu lớp phủ, mặc định đen
  targetOpacity: number; // 0-1 — độ tối tối đa lúc đang Play
  fadeDurationMs: number; // ms — tốc độ chuyển sáng/tối
}

export interface DimBackgroundComponent extends BaseComponent {
  type: "dimBackground";
  props: DimBackgroundProps;
}

// Receiver thuần, tái tạo lại Button action "openLink" cũ (đã xoá khỏi Button lúc Button trở thành
// Emitter thuần) dưới dạng 1 Receiver riêng — nhận lệnh "LinkOpener.Open" thì mở URL lấy từ 1 field
// (cố định hay cột extra_data) của winner GẦN NHẤT (data.results[0], xem LinkOpenerView.tsx) bằng
// window.api.shell.openExternal. Không có emits (mở URL diễn ra tức thời, không cần ngoại lệ hẹp
// kiểu Wheel.SpinCompleted). Không có state "disabled" nào ở đây hay ở Button — nếu chưa có winner
// hoặc field rỗng thì LinkOpenerView tự no-op im lặng, giữ Button hoàn toàn không biết gì về Draw.
export interface LinkOpenerProps {
  urlField: string; // "code" | "phone" | "email" | "name" hoặc tên 1 cột extra_data, xem LinkOpenerPanel.tsx
}

export interface LinkOpenerComponent extends BaseComponent {
  type: "linkOpener";
  props: LinkOpenerProps;
}

// Receiver thuần, tái tạo lại Button action "draw" cũ — nhận lệnh "Draw.Pick" thì gọi
// sequence.pick() (chọn 1 candidate MỚI, CHƯA ghi DB — xem useDrawSequence.ts). KHÔNG có config gì
// (pick() chỉ cần sessionId, Draw Engine tự quyết định giải/người tiếp theo). NGOẠI LỆ HẸP (giống
// Lucky Wheel — xem CLAUDE.md): pick() là 1 lời gọi IPC bất đồng bộ, trong khi Wheel.StartSpin đọc
// results[0] NGAY LÚC nhận lệnh (xem WheelTemplate.tsx) — nếu Draw chỉ listensFor mà không emits,
// không có cách nào nối "Draw xong" → "Wheel bắt đầu quay" chính xác mà không đoán 1 delay cố định.
// Nên Draw vừa listensFor "Draw.Pick" vừa emits "Draw.Picked", bắn qua sequence.fireClick() CHỈ khi
// pick() thật sự thành công (xem DrawView.tsx) — không bắn nếu pick() lỗi (hết participant/prize).
export interface DrawProps {}

export interface DrawComponent extends BaseComponent {
  type: "draw";
  props: DrawProps;
}

// Receiver thuần, tái tạo lại Button action "confirm" cũ — nhận lệnh "ConfirmWinner.Confirm" thì
// gọi sequence.confirm() (ghi thật candidate đang chờ vào draw_results, xem useDrawSequence.ts).
// KHÔNG có config gì. KHÔNG có emits — confirm() ghi DB xong là kết thúc, không có gì để nối chuỗi
// tiếp theo dựa vào (khác Draw, không cần ngoại lệ hẹp). confirm() đã tự no-op nếu chưa có candidate
// đang chờ (isPending=false) hoặc đang busy — ConfirmWinnerView.tsx không cần thêm điều kiện nào,
// giữ đúng triết lý "Receiver tự no-op im lặng" đã áp dụng cho LinkOpenerView.tsx.
export interface ConfirmWinnerProps {}

export interface ConfirmWinnerComponent extends BaseComponent {
  type: "confirmWinner";
  props: ConfirmWinnerProps;
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
  | ButtonComponent
  | ScoreboardComponent
  | FireworksComponent
  | StageLightComponent
  | DimBackgroundComponent
  | LinkOpenerComponent
  | DrawComponent
  | ConfirmWinnerComponent;

export type LandingComponentType = LandingComponent["type"];

export interface BackgroundConfig {
  type: "color" | "image";
  color: string; // hex — luôn có, dùng làm màu viền letterbox khi type = "image" không phủ hết khung
  imageDataUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
}

// 1 "chip tín hiệu" đã được kéo từ sidebar (TriggerSidebar.tsx) thả vào khung Trigger Graph — CHỈ
// là 1 điểm nối đã ĐẶT RA, chưa chắc đã nối dây với chip nào khác (nối dây thật mới tạo ra
// TriggerAction, xem types.ts). `id` cố tình lấy dạng suy ra được thẳng từ ownerComponentId+signal
// (không phải random) — 1 component không thể có 2 chip trùng tín hiệu, tra trùng dễ dàng.
export interface SignalChipPlacement {
  id: string; // `${ownerComponentId}::${signal}`
  ownerComponentId: string;
  signal: string; // vd "Button.Click", "Wheel.StartSpin"
  role: "emit" | "listen"; // suy ra từ COMPONENT_SIGNALS lúc kéo vào — emit thì có handle "source", listen thì có handle "target"
}

// Vị trí các node trên khung Trigger Graph (xem TriggerGraphEditor.tsx) — CHỈ là toạ độ layout của
// riêng màn hình graph, không liên quan gì tới x/y của component trên landing canvas thật. Key =
// id của node: component.id thật cho Component Node, hoặc SignalChipPlacement.id cho 1 chip tín
// hiệu. 1 node CHƯA từng bị kéo tay sẽ không có mặt ở đây — TriggerGraphEditor tự tính cho nó 1 vị
// trí mặc định hợp lý (rank theo thứ tự chuỗi Emitter→Receiver, lane theo nhánh rẽ — xem
// computeComponentRanks/computeComponentLanes) cho tới khi người dùng thật sự kéo nó đi.
export interface TriggerGraphLayout {
  nodePositions?: Record<string, { x: number; y: number }>;
  // Chip nào đã được kéo vào canvas — độc lập với đã nối dây hay chưa (xem SignalChipPlacement).
  // Optional/rỗng nghĩa là chưa kéo chip nào vào cả.
  signalChips?: SignalChipPlacement[];
}

export interface LandingConfig {
  version: 1;
  canvas: {
    width: number; // cố định 1920 ở v1
    height: number; // cố định 1080 ở v1 (16:9)
    background: BackgroundConfig;
  };
  components: LandingComponent[];
  triggerGraph?: TriggerGraphLayout;
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

/** Chiều cao "vừa khít" cho template "digitRoller" ở 1 width cho trước — LẶP LẠI chính xác công
 * thức cellWidth/cellHeight trong DigitRollerTemplate.tsx (gap=8px, tỉ lệ cellWidth:cellHeight =
 * 0.7:1). Dùng ở LandingBuilderWindow (áp lại MẶC ĐỊNH sau mọi thay đổi width/digitCount/template,
 * xem fitDigitRollerHeight) để khung kéo-thả LUÔN sát đúng kích thước thật — người dùng không tự
 * chỉnh height rời rạc cho template này, height luôn là giá trị DẪN XUẤT từ width + digitCount. */
export function computeDigitRollerFitHeight(widthBound: number, digitCount: number): number {
  const gap = 8;
  const count = Math.max(1, Math.floor(digitCount || 3));
  const cellWidth = Math.max(14, (widthBound - gap * (count - 1)) / count);
  return Math.max(20, Math.round(cellWidth / 0.7));
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
  sourceComponentId: string;
  firedAt: number; // Date.now() tại lúc component này phát tín hiệu — dùng để tính delay của TriggerAction
}

// Thời điểm phát tín hiệu GẦN NHẤT của TỪNG component nguồn (key = component.id), không phải chỉ 1
// lần phát gần nhất toàn cục — 1 trang có thể có nhiều Button, mỗi cái phát tín hiệu độc lập, nên 1
// Button khác được bấm không được làm lệch thời điểm mà 1 TriggerAction đang chờ ĐÚNG nguồn của nó
// (xem useTriggerCommands.ts).
export type TriggerLog = Partial<Record<string, LastTrigger>>;

export interface DrawSequenceActions {
  candidate: import("@/types").DrawCandidate | null;
  isPending: boolean; // đã pick nhưng chưa confirm — Draw bị khoá, Confirm/Redo mở
  busy: boolean; // đang có 1 lời gọi IPC dở dang — khoá cả 3 nút tránh bấm chồng
  error: string | null;
  triggerLog: TriggerLog; // thời điểm phát tín hiệu gần nhất của từng component nguồn (xem TriggerLog ở trên)
  // Trả Promise thật (không phải void) — DrawView.tsx cần await để biết CHẮC pick() đã thành công
  // trước khi bắn "Draw.Picked" (ngoại lệ hẹp, xem componentRegistry.ts), tránh Wheel đọc phải
  // candidate cũ nếu bắn tín hiệu ngay khi vừa gọi thay vì đợi IPC thật sự xong.
  pick: () => Promise<void>;
  confirm: () => void;
  redo: () => void;
  // Ghi nhận 1 component (thường là Button) VỪA phát tín hiệu "click" — thuần là 1 sổ ghi thời điểm
  // cho Trigger Graph đọc qua useTriggerCommands.ts, KHÔNG tự làm gì khác (không gọi IPC, không đổi
  // candidate/isPending/busy) — logic thật của từng action (pick/confirm/redo/...) vẫn ở pick()/
  // confirm()/redo() như cũ, độc lập hoàn toàn với việc component này có được Trigger Graph nối dây
  // hay không. Gọi bởi MỌI Button bất kể action gì (xem ButtonView.tsx) — không riêng gì Draw.
  fireClick: (componentId: string) => void;
  // Hiện/ẩn component Scoreboard (cửa sổ phụ giữa màn hình) — UI thuần cục bộ, không liên quan gì
  // tới draw/confirm/redo/busy nên tách hẳn khỏi state đó. toggleScoreboard() dùng bởi Button action
  // "showScoreboard"; hideScoreboard() dùng bởi nút đóng (X)/click ra ngoài trên chính Scoreboard —
  // tách riêng khỏi toggle để luôn ĐÓNG chắc chắn thay vì có thể bật nhầm lại nếu gọi 2 lần.
  scoreboardVisible: boolean;
  toggleScoreboard: () => void;
  hideScoreboard: () => void;
  // Xoá draw_results + trả remaining prizes về quantity gốc cho CẢ session (xem resetSession trong
  // drawEngine.ts), rồi tự xoá luôn candidate/pending đang giữ trong bộ nhớ — "quay về như ban đầu"
  // đúng nghĩa. Chỉ khoá bởi busy, không phụ thuộc isPending (khác confirm/redo).
  resetSession: () => void;
}
