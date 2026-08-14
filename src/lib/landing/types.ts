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
//
// Không có khái niệm "tín hiệu"/Trigger Graph nữa (đã bỏ) — component nào cần phản ứng theo thao
// tác người vận hành thì đọc thẳng LandingData (vd Lucky Wheel tự phát hiện có candidate mới qua
// results[0].id đổi, xem WheelTemplate.tsx), hoặc là chính Button gọi thẳng 1 hàm của
// DrawSequenceActions khi được bấm (xem ButtonProps.action/ButtonView.tsx).

export type EffectName = "none" | "fadeIn" | "slideUp" | "pulse" | "bounce";

export const EFFECT_NAMES: EffectName[] = ["none", "fadeIn", "slideUp", "pulse", "bounce"];

interface BaseComponent {
  id: string;
  // Tên hiển thị do người dùng tự đặt (optional) — chỉ dùng làm nhãn thay thế trong LayersPanel.tsx
  // khi trang có nhiều component CÙNG loại (vd 2 Button đều tên mặc định "Button" thì khó phân biệt
  // trong danh sách Layers). Rỗng/undefined thì tự dùng nhãn loại component (vd "Button", "Text")
  // làm fallback — xem SharedFields.tsx (nơi sửa) và componentLabelOf() trong LayersPanel.tsx (nơi đọc).
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number; // thứ tự trước/sau — sửa được qua kéo-thả trong LayersPanel.tsx (xem onReorder)
  effect: EffectName;
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

// Hiệu ứng CHUYỂN CẢNH — đúng 1 LẦN, đúng khoảnh khắc fallbackText bị THAY bằng tên người trúng thật
// (xem WinnerNameView.tsx) — 2 lớp text chồng lên nhau (fallback đang mất đi + tên thật đang hiện ra)
// cùng lúc, KHÁC HẲN `revealEffect` bên dưới (hiệu ứng "đứng yên/xuất hiện" áp cho BẤT KỲ đoạn text
// nào đang hiện tại 1 thời điểm, kể cả lúc còn là fallback — vd chọn "pulse" thì fallback tự pulse
// liên tục trong lúc chờ). "none" = đổi tức khắc, không hiệu ứng chuyển cảnh gì (revealEffect vẫn áp
// bình thường cho lớp mới ngay khi hiện).
export type WinnerTransitionEffect = "none" | "crossfade" | "slideUp" | "slideDown" | "zoom";

export const WINNER_TRANSITION_EFFECTS: WinnerTransitionEffect[] = [
  "none",
  "crossfade",
  "slideUp",
  "slideDown",
  "zoom",
];

// CHỈ Winner Name có thêm 2 field này (prizeName KHÔNG có — xem PrizeNameView.tsx không hề "chờ" gì
// cả, hiện dữ liệu thật ngay khi có, không có pha "fallback rồi đổi sang thật" như Winner Name có
// nhờ revealDelayMs, nên không có khoảnh khắc nào để 1 hiệu ứng riêng phát huy tác dụng). `revealEffect`
// KHÁC với field `effect` chung (SharedFields.tsx, áp cho khung NGOÀI mỗi khi có lượt quay mới) —
// field này tái dùng nguyên bộ EffectName/CSS class đã có (landingEffects.css) cho quen mắt, áp cho
// ĐOẠN TEXT đang hiện (fallback hoặc tên thật) ở TRẠNG THÁI ĐỨNG YÊN — không định nghĩa hẳn 1 bộ hiệu
// ứng mới cho việc này.
export interface WinnerNameProps extends LiveTextProps {
  revealEffect: EffectName;
  transitionEffect: WinnerTransitionEffect;
}

// CHỈ dùng bởi PrizeImageComponent — "latestWinner" là hành vi GỐC (tự đổi theo results[0], dùng cho
// kiểu "công bố kết quả"). "specificPrize" LUÔN hiện đúng 1 giải CỐ ĐỊNH do người dùng chọn
// (`prizeId`), không đổi theo kết quả quay — dùng để đặt NHIỀU Prize Image rải rác khắp landing,
// mỗi cái tự do vị trí/kích thước khớp đúng 1 chỗ trong ảnh nền artwork (vd 1 cái đè lên ảnh xe đẩy,
// 1 cái đè lên ảnh hộp sữa), đại diện đúng 1 giải — KHÔNG sinh thêm ảnh theo quantity của giải.
// `selectable` (chỉ có ý nghĩa khi source = "specificPrize") bật hover-glow + click để CHỌN giải đó
// cho Draw — tái dùng NGUYÊN VẸN DrawSequenceActions.selectedPrizeId/togglePrizeSelection/
// notifyOutOfStock đã có (xem PrizeGalleryView.tsx, hành vi glow/xám khi hết hàng giống hệt).
export interface LiveImageProps {
  fit: "cover" | "contain" | "stretch";
  borderRadius: number;
  fallbackImageDataUrl: string | null;
  source: "latestWinner" | "specificPrize";
  prizeId?: string; // chỉ dùng khi source = "specificPrize"
  selectable: boolean; // chỉ có ý nghĩa khi source = "specificPrize"
  glowColor: string; // chỉ dùng khi selectable = true
}

export interface PrizeListProps {
  fontSize: number;
  color: string;
  showRemaining: boolean;
}

// Lưới ảnh TẤT CẢ giải trong session — di chuột vào 1 ô hiện quầng sáng (tắt khi rời chuột), CLICK
// thì quầng sáng đó Ở LẠI CỐ ĐỊNH = đã CHỌN giải đó để Draw/Confirm tiếp theo áp dụng đúng giải này
// (xem DrawSequenceActions.selectedPrizeId, tái dùng lockedPrizeId đã có sẵn ở
// electron/drawEngine.ts — không cần sửa gì tầng Electron/DB). Giải hết hàng (remaining <= 0) hoặc
// không active tự xám lại, không chọn được — click vào đó hiện popup báo hết thay vì chọn (xem
// PrizeGalleryView.tsx, DrawSequenceActions.notifyOutOfStock).
export interface PrizeGalleryProps {
  columns: number;
  gap: number;
  imageFit: "cover" | "contain" | "stretch";
  borderRadius: number;
  showName: boolean;
  nameFontSize: number;
  nameColor: string;
  glowColor: string; // dùng chung cho glow lúc hover (nhạt) lẫn lúc đã chọn (đậm hơn)
}

export interface PrizeGalleryComponent extends BaseComponent {
  type: "prizeGallery";
  props: PrizeGalleryProps;
}

export interface WinnerNameComponent extends BaseComponent {
  type: "winnerName";
  props: WinnerNameProps;
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
// ra giữa màn hình như 1 cửa sổ phụ khi 1 Button với action "toggleScoreboard" được bấm (xem
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

// Button — thao tác trực tiếp bởi người vận hành ở Present Mode, đúng 1 action CỐ ĐỊNH chọn từ
// dropdown (không phải tín hiệu tự do) — bấm là chạy NGAY đúng hành động đó, gọi thẳng 1 hàm của
// DrawSequenceActions (xem ButtonView.tsx). "openLink" cần thêm `urlField` (field cố định của
// Participant hoặc tên 1 cột extra_data) để biết mở URL nào — đọc từ winner GẦN NHẤT
// (data.results[0]), no-op im lặng nếu chưa có winner hoặc field rỗng (xem getParticipantField).
// KHÔNG còn "redo" riêng — Draw và Redraw/Discard đã GỘP LÀM 1: bấm "draw" lúc đang có candidate
// CHỜ CONFIRM (sequence.isPending) tự chạy sequence.redo() thay vì pick() mới, xem ButtonView.tsx.
export type ButtonAction = "none" | "draw" | "confirm" | "reset" | "toggleScoreboard" | "openLink";

export interface ButtonProps {
  action: ButtonAction;
  urlField?: string; // chỉ dùng khi action = "openLink"
  label: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  borderRadius: number;
  strokeColor: string;
  strokeWidth: number; // 0 = không viền
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
  | PrizeGalleryComponent
  | CountdownComponent
  | CurrentTimeComponent
  | ParticipantCountComponent
  | ButtonComponent
  | ScoreboardComponent;

export type LandingComponentType = LandingComponent["type"];

export interface BackgroundConfig {
  type: "color" | "image";
  color: string; // hex — luôn có, dùng làm màu viền letterbox khi type = "image" không phủ hết khung
  imageDataUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
  // Dim nền (phủ 1 lớp đen mờ dần lên TRÊN background, DƯỚI mọi component khác — "spotlight" cho nội
  // dung như Winner Name/Button nổi bật hơn) khi Lucky Wheel trên trang đã quay xong hẳn — optional,
  // mặc định TẮT hoàn toàn (field không tồn tại ở config cũ, đọc bằng `??` giữ đúng hành vi cũ, xem
  // BackgroundDimOverlay.tsx). 2 CHIỀU tách biệt hoàn toàn, mỗi chiều tự có delay + thời gian chuyển
  // riêng — "start" = dim XUỐNG sau khi Wheel quay xong, "end" = sáng LẠI sau khi bấm Draw/Discard lần
  // tiếp (candidate mới xuất hiện). `dimAmount` là mức tối ĐÍCH dùng chung cho cả 2 chiều (chỉ có 1 độ
  // tối "hết mức", không cần tách riêng).
  dimOnSpinEnd?: boolean;
  dimAmount?: number; // 0-100 (%) — độ tối khi dim hết mức (opacity lớp phủ đen = dimAmount/100)
  // Trễ trước khi bắt đầu dim XUỐNG, tính từ lúc Wheel quay xong hẳn (cùng mốc winnerRevealDelayMs
  // dùng cho WinnerNameView — xem computeWheelRevealDelayMs) — 0 = bắt đầu dim ngay lúc vừa dừng.
  // ÂM = bắt đầu SỚM HƠN (từ lúc còn đang quay gần xong). DƯƠNG = trễ hơn, sau khi đã dừng hẳn.
  dimStartDelayMs?: number;
  dimStartDurationMs?: number; // ms — TỪ lúc bắt đầu dim xuống TỚI lúc dim hẳn (tốc độ chuyển mờ dần)
  // Trễ trước khi bắt đầu sáng LẠI, tính từ lúc có candidate MỚI (bấm Draw/Discard lần tiếp) — luôn
  // KHÔNG ÂM (không có khái niệm "trước khi Draw" ở đây, Draw là 1 sự kiện rời rạc).
  dimEndDelayMs?: number;
  dimEndDurationMs?: number; // ms — TỪ lúc bắt đầu sáng lại TỚI lúc sáng hẳn
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

/** Tổng thời lượng (ms) 1 Lucky Wheel THẬT SỰ quay xong hẳn — LẶP LẠI đúng công thức tính thời điểm
 * dừng ở WheelTemplate.tsx (luôn đúng spinDurationMs) và DigitRollerTemplate.tsx (revealTiming
 * "together" cũng đúng spinDurationMs; "sequential" ô CUỐI dừng trễ hơn ô đầu — lấy CẬN TRÊN, đúng
 * jitter cao nhất 1.3x mà DigitRollerTemplate.tsx có thể random ra, để không bao giờ tính thiếu).
 * Dùng để WinnerNameView (xem file đó) biết cần CHỜ bao lâu trước khi hiện tên thật — không hiện
 * ngay khi có candidate mới trong khi Wheel/Digit Roller trên trang vẫn còn đang quay dở. */
function wheelRevealDurationMs(props: LuckyWheelProps): number {
  if (props.template !== "digitRoller" || props.revealTiming !== "sequential") return props.spinDurationMs;
  const count = Math.max(1, Math.floor(props.digitCount || 3));
  return props.spinDurationMs + (count - 1) * props.revealStaggerMs * 1.3;
}

/** Khoảng CHỜ (ms) trước khi hiện dữ liệu MỚI của 1 kết quả quay — lấy giá trị LỚN NHẤT trong mọi
 * Lucky Wheel đang có trên trang (thường chỉ 1). Trang KHÔNG có Lucky Wheel nào → 0 (hiện ngay lập
 * tức), giữ đúng hành vi cũ cho layout không có Wheel (vd màn hình phụ chỉ hiện tên, không có Wheel). */
export function computeWheelRevealDelayMs(components: LandingComponent[]): number {
  const wheels = components.filter((c): c is LuckyWheelComponent => c.type === "luckyWheel");
  if (wheels.length === 0) return 0;
  return Math.max(...wheels.map((w) => wheelRevealDurationMs(w.props)));
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
 * giá trị rỗng — ButtonView dựa vào null để tự no-op, không mở link rỗng/hỏng. */
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
export interface DrawSequenceActions {
  candidate: import("@/types").DrawCandidate | null;
  isPending: boolean; // đã pick nhưng chưa confirm — Draw bị khoá, Confirm/Redo mở
  busy: boolean; // đang có 1 lời gọi IPC dở dang — khoá cả 3 nút tránh bấm chồng
  error: string | null;
  // Trả Promise thật (không phải void) — Button action "draw" cần await để bắt lỗi (hết
  // participant/prize, lỗi IPC...) mà không làm crash handler click (xem ButtonView.tsx).
  pick: () => Promise<void>;
  confirm: () => void;
  redo: () => void;
  // Hiện/ẩn component Scoreboard (cửa sổ phụ giữa màn hình) — UI thuần cục bộ, không liên quan gì
  // tới draw/confirm/redo/busy nên tách hẳn khỏi state đó. toggleScoreboard() dùng bởi Button action
  // "toggleScoreboard"; hideScoreboard() dùng bởi nút đóng (X)/click ra ngoài trên chính Scoreboard —
  // tách riêng khỏi toggle để luôn ĐÓNG chắc chắn thay vì có thể bật nhầm lại nếu gọi 2 lần.
  scoreboardVisible: boolean;
  toggleScoreboard: () => void;
  hideScoreboard: () => void;
  // Xoá draw_results + trả remaining prizes về quantity gốc cho CẢ session (xem resetSession trong
  // drawEngine.ts), rồi tự xoá luôn candidate/pending đang giữ trong bộ nhớ — "quay về như ban đầu"
  // đúng nghĩa. Chỉ khoá bởi busy, không phụ thuộc isPending (khác confirm/redo).
  resetSession: () => void;
  // Popup xác nhận chung — dùng cho action "confirm"/"reset" của Button (2 action ghi dữ liệu THẬT,
  // VĨNH VIỄN, xem docs/landing-builder.md mục 6), tránh bấm nhầm giữa lúc trình chiếu trực tiếp.
  // ButtonView.tsx gọi requestConfirm(message, action) THAY VÌ chạy action ngay — action thật (vd
  // sequence.confirm()) chỉ chạy SAU KHI resolveConfirmPrompt(true) từ nút "Confirm" trên popup (vẽ
  // ở LandingRenderer.tsx, đọc confirmPrompt). resolveConfirmPrompt(false) (nút Cancel/bấm ra ngoài)
  // chỉ đóng popup, không chạy gì. Thuần UI cục bộ, không liên quan IPC/busy.
  confirmPrompt: { message: string } | null;
  requestConfirm: (message: string, action: () => void) => void;
  resolveConfirmPrompt: (confirmed: boolean) => void;
  // Giải đang được CHỌN qua PrizeGalleryView.tsx (click 1 ảnh giải) — khác null thì pick() TRUYỀN
  // THẲNG vào lockedPrizeId đã có sẵn ở electron/drawEngine.ts, ép Draw chỉ random người TRONG đúng
  // giải này (thay vì random có trọng số toàn bộ giải còn hàng như mặc định). togglePrizeSelection
  // gọi lại đúng id đang chọn = bỏ chọn; gọi id khác = CHUYỂN sang giải đó luôn, không cần bỏ chọn
  // giải cũ trước.
  selectedPrizeId: string | null;
  togglePrizeSelection: (prizeId: string) => void;
  // Popup "hết hàng" — khác null = đang cần hiện (xem LandingRenderer.tsx). Tự bật khi giải đang
  // CHỌN vừa hết hàng (remaining về 0, thường ngay sau Confirm — xem useDrawSequence.ts, tự bỏ chọn
  // luôn lúc này), HOẶC khi PrizeGalleryView.tsx gọi notifyOutOfStock() vì người dùng click 1 giải
  // ĐÃ xám (hết hàng/không active) từ trước, chưa từng được chọn.
  outOfStockPrizeName: string | null;
  notifyOutOfStock: (prizeName: string) => void;
  dismissOutOfStock: () => void;
}
