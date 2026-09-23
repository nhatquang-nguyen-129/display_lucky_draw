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
  // Mặc định undefined/false = giữ NGUYÊN hành vi cũ (luôn hiện `content`, không phụ thuộc Draw) —
  // landing đã lưu trước khi có field này không hề bị ảnh hưởng. true = hiện/ẩn theo đúng chu trình đã
  // cấu hình ở `drawCycle` bên dưới (xem doc-comment DrawCycleConfig ở trên) — CÙNG model với
  // ImageProps (TextView.tsx dùng chung `useDrawCycleVisibility`, xem drawRevealHooks.ts) vì `content`
  // là 1 chuỗi TĨNH do người dùng tự đặt, không đổi theo từng lượt quay (khác Winner Name — tên người
  // trúng đổi theo TỪNG lượt, xem WinnerNameProps).
  syncWithDraw?: boolean;
  drawCycle?: DrawCycleConfig;
}

// "Appearance" — trạng thái ĐÍCH của 1 mốc (Idle/Draw/Redraw) trong chu trình đồng bộ Draw. 4 giá trị
// PEER nhau, dùng CHUNG giữa mọi loại component có `syncWithDraw` (Text/Image CHỈ dùng 2 giá trị đầu
// qua Panel của chúng — "dim"/"blur" không xuất hiện trong dropdown Appearance của chúng, dù type cho
// phép — landing cũ chỉ từng lưu "appear"/"disappear" vẫn hợp lệ nguyên vẹn; Background dùng đủ cả 4,
// xem BackgroundPanel.tsx):
//   - "appear"/"disappear": nội dung hiện/ẩn hẳn (Text/Image/Background đều dùng được — với
//     Background, "disappear" nghĩa là ẩn hẳn ảnh nền, lộ ra màu đen của canvas).
//   - "dim"/"blur": CHỈ Background dùng — 1 lớp filter phủ lên ảnh (không ẩn ảnh, chỉ làm tối/mờ đi),
//     xem `DrawPhaseEffectConfig.amount` bên dưới cho cường độ.
// Idle LUÔN phải có 1 giá trị thật (không có "none" — Idle là trạng thái nghỉ mặc định, không phải 1
// "hành động").
export type DrawRestState = "appear" | "disappear" | "dim" | "blur";

// Appearance của Draw/Redraw — thêm "none" (không làm gì, giữ nguyên trạng thái đang có) so với
// DrawRestState của Idle. Properties Panel (ImagePanel.tsx/BackgroundPanel.tsx) RÀNG BUỘC lựa chọn
// hợp lệ: 1 phase KHÔNG được trùng giá trị với phase THẬT (khác "none") gần nhất phía TRƯỚC nó trong
// chuỗi Idle→Draw→Redraw (Draw so với Idle; Redraw so với Draw NẾU Draw có giá trị thật, ngược lại so
// với Idle) — vô hiệu hoá (disabled) đúng 1 lựa chọn đó ngay trên dropdown, không cho tự do chọn bừa.
// Với domain 2 giá trị (Text/Image) điều này ép Draw/Redraw luân phiên NHỊ PHÂN y hệt hành vi cũ
// (Draw bắt buộc = giá trị còn lại duy nhất, Redraw bắt buộc quay về đúng idleState) — domain 4 giá
// trị (Background) thì mỗi phase còn NHIỀU lựa chọn hợp lệ hơn (chỉ cấm đúng 1 giá trị vừa dùng ngay
// trước, không ép phải quay lại ĐÚNG idleState như bản nhị phân).
export type DrawPhaseAction = "none" | DrawRestState;

export interface DrawPhaseEffectConfig {
  effect: WinnerTransitionEffect;
  delayMs?: number;
  // CHỈ có ý nghĩa khi trạng thái ĐÍCH của phase này là "dim" (0-100, %) hoặc "blur" (px) — Text/Image
  // không bao giờ đọc/ghi field này (Panel của chúng không cho chọn dim/blur). Xem
  // DEFAULT_BACKGROUND_DIM_AMOUNT/DEFAULT_BACKGROUND_BLUR_AMOUNT bên dưới cho giá trị mặc định.
  amount?: number;
}

// Toàn bộ chu trình hiện/ẩn (hoặc dim/blur) theo Draw của 1 component TĨNH (dùng bởi ImageProps/
// TextProps/BackgroundProps — CẢ 3 đều là "1 thứ cố định do người dùng tự đặt, không đổi theo từng
// lượt quay", khác Winner Name — tên người trúng đổi theo TỪNG lượt, xem WinnerNameProps/useRevealed)
// — CHỈ 1 input tự do hoàn toàn (`idleState`), còn `drawAction`/`redrawAction` bị RÀNG BUỘC theo quy
// tắc "khác giá trị thật gần nhất phía trước" (xem doc-comment DrawPhaseAction ở trên):
//   - idleState   : trạng thái nghỉ (xem DrawRestState) — hiệu ứng đi kèm (`idleEffect`) CHẠY LÚC
//     QUAY VỀ idleState, CHỈ xảy ra khi Reset (`resetSeq` đổi), KHÔNG BAO GIỜ chạy lúc trang vừa mở
//     (chưa từng rời khỏi Idle thì không có gì để "quay về", xem useDrawCycleVisibility trong
//     drawRevealHooks.ts).
//   - drawAction  : "none" (Draw không đổi gì, giữ nguyên trạng thái đang có) HOẶC khác `idleState` —
//     Panel vô hiệu hoá đúng lựa chọn TRÙNG idleState trên dropdown. Khác "none" thì dùng `drawEffect`
//     để chuyển sang trạng thái đó.
//   - redrawAction: "none" (Redraw không đổi gì) HOẶC khác `drawAction` (nếu `drawAction !== "none"`,
//     ngược lại khác `idleState`) — Panel vô hiệu hoá đúng 1 lựa chọn đó trên dropdown. Khác "none"
//     thì dùng `redrawEffect` để chuyển sang trạng thái đó, rồi — NẾU `drawAction !== "none"` — TỰ
//     ĐỘNG chạy tiếp bằng CHÍNH `drawEffect` để chuyển LẠI trạng thái mà Draw đưa tới, SAU KHI
//     `redrawEffect` chạy xong HẲN (nối tiếp thật, không đo song song) — đúng ý "đổi trạng thái rồi
//     đổi lại ngay khi ấn quay tiếp". Không cần field effect riêng cho bước "đổi lại" này — công bố
//     kết quả là ĐÚNG 1 hành động dù là Draw lần đầu hay Redraw.
export interface DrawCycleConfig {
  idleState: DrawRestState;
  idleEffect?: DrawPhaseEffectConfig;
  drawAction: DrawPhaseAction;
  drawEffect?: DrawPhaseEffectConfig;
  redrawAction: DrawPhaseAction;
  redrawEffect?: DrawPhaseEffectConfig;
}

// Fallback AN TOÀN khi `syncWithDraw` chưa từng bật (chưa có `drawCycle` nào lưu) — chỉ cần hợp lệ về
// type, KHÔNG được đọc/dùng ở đâu khi `syncWithDraw` tắt (xem ImageView.tsx).
export const DEFAULT_DRAW_CYCLE: DrawCycleConfig = { idleState: "disappear", drawAction: "none", redrawAction: "none" };

export interface ImageProps {
  srcDataUrl: string | null; // base64, giống cách PrizeFormModal lưu display_image
  fit: "cover" | "contain" | "stretch";
  borderRadius: number;
  // Mặc định undefined/false = giữ NGUYÊN hành vi cũ (ảnh luôn hiện tĩnh, không phụ thuộc Draw) —
  // landing đã lưu trước khi có field này không hề bị ảnh hưởng. true = hiện/ẩn theo đúng chu trình đã
  // cấu hình ở `drawCycle` bên dưới (xem doc-comment DrawCycleConfig ở trên) — dùng cho 1 ảnh PNG cần
  // tự đồng bộ với quy trình quay (vd Podium tách khỏi Background để không bị dim theo, xem
  // docs/landing/properties-panel.md) mà không cần tạo hẳn 1 loại component riêng. Cùng hệ hiệu ứng
  // (WinnerTransitionEffect) với Winner Name/Text nhưng KHÁC hook (ImageView.tsx dùng
  // useDrawCycleVisibility, không phải useRevealed — xem drawRevealHooks.ts).
  syncWithDraw?: boolean;
  drawCycle?: DrawCycleConfig;
}

export interface TextComponent extends BaseComponent {
  type: "text";
  props: TextProps;
}

export interface ImageComponent extends BaseComponent {
  type: "image";
  props: ImageProps;
}

// Giá trị `amount` mặc định khi 1 phase mới được đổi sang đích "dim"/"blur" mà chưa từng cấu hình gì
// (xem BackgroundPanel.tsx) — Dim 80% theo đúng yêu cầu, Blur 16px chọn tạm 1 mức vừa phải.
export const DEFAULT_BACKGROUND_DIM_AMOUNT = 80;
export const DEFAULT_BACKGROUND_BLUR_AMOUNT = 16;

// Component riêng cho ảnh nền (tách khỏi Image cũ) — về mặt props Basic options gần như giống hệt
// ImageProps, tách type riêng CHỦ YẾU để sau này mở rộng thêm video mà không đụng gì tới Image thường
// (2 mảng props sẽ tự phân kỳ dần theo nhu cầu). Không có borderRadius như Image — Background dùng để
// phủ nền nên bo góc không có ý nghĩa. Không còn khái niệm màu nền/letterbox riêng nữa — phần canvas
// không được Background nào phủ tới LUÔN là màu đen cố định (xem LandingRenderer.tsx).
//
// "Interactions with Draw" dùng THẲNG `DrawCycleConfig`/`DrawCycleFields.tsx` — CÙNG kiến trúc với
// Image/Text (xem doc-comment DrawCycleConfig ở trên), chỉ khác ở Panel: Background cho chọn cả 4 giá
// trị Appearance (Appear/Disappear/Dim/Blur) thay vì 2. "Self Interactions" (phản ứng theo thao tác
// người vận hành với CHÍNH component này, khác "with Draw") — CHƯA có mục nào cụ thể, chỉ để sẵn chỗ
// trong Properties Panel (xem BackgroundPanel.tsx) cho tính năng tương lai, không có field nào ở đây
// cho tới lúc đó.
export interface BackgroundProps {
  srcDataUrl: string | null;
  fit: "cover" | "contain" | "stretch";
  // Mặc định undefined/false = ảnh nền luôn "sạch" (không filter gì) như hành vi cũ, landing đã lưu
  // trước khi có tính năng này không bị ảnh hưởng — xem doc-comment tương tự ImageProps.syncWithDraw.
  syncWithDraw?: boolean;
  drawCycle?: DrawCycleConfig;
}

export interface BackgroundComponent extends BaseComponent {
  type: "background";
  props: BackgroundProps;
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
  // trong, mỗi phần VỀ MẶT DỮ LIỆU/RENDER (DigitRollerTemplate.tsx) vẫn là 2 field tách rời.
  // reelCardEffect — hiệu ứng cho KHUNG TRẮNG: "pop" = khung "bật ra" (scale+fade), tạo cảm giác
  // xuất hiện chớp nhoáng. Không đụng gì tới bản thân ký tự bên trong.
  // KHÔNG còn dropdown "Effect" riêng trong Properties Panel nữa (đơn giản hoá — Panel giờ chỉ còn
  // đúng 3 field: Duration/Spin style/Style, xem LuckyWheelPanel.tsx) — component MỚI tạo luôn dùng
  // combination "pop" (reelCardEffect="pop" + reelNumberEffect="bounce", xem componentRegistry.ts),
  // landing CŨ đã tự chỉnh tay trước khi bỏ dropdown vẫn giữ nguyên giá trị đã lưu (kể cả bật lẻ/
  // không đồng bộ 2 field này từ trước khi panel từng gộp chung 1 dropdown).
  reelCardEffect: "none" | "pop";
  // reelNumberEffect — hiệu ứng cho CHÍNH KÝ TỰ (không đụng khung): "bounce" = ký tự nảy lên nhẹ rồi
  // rơi xuống đúng vị trí giữa, kiểu quả bóng chạm đất, chỉ 1 nhịp nhỏ (không phải hiệu ứng của khung).
  reelNumberEffect: "none" | "bounce";
  // Trục 2 — thời điểm các ô CHUYỂN SANG PHA CHỐT (settling — bắt đầu giảm tốc dần rồi dừng ở ký tự
  // thật): "together" = mọi ô vào pha chốt ngay t=0 (chốt cùng lúc, cùng giảm tốc). "sequential" =
  // ô thứ i CHỈ bắt đầu giảm tốc SAU KHI ô (i-1) đã dừng hẳn + revealStaggerMs — trong lúc chờ tới
  // lượt, ô đó vẫn nhấp nháy/cuộn NHANH BÌNH THƯỜNG (không giảm tốc theo ô đang chốt). KHÔNG còn
  // dropdown "Timing" riêng trong Properties Panel nữa (đơn giản hoá, cùng đợt với reelCardEffect ở
  // trên) — component MỚI tạo luôn dùng "sequential" (xem componentRegistry.ts), landing CŨ đã tự
  // chỉnh tay trước đó vẫn giữ nguyên giá trị đã lưu.
  revealTiming: "together" | "sequential";
  // Chỉ có tác dụng khi revealTiming = "sequential" — khoảng nghỉ (ms) SAU KHI ô này đã dừng hẳn,
  // trước khi ô kế tiếp bắt đầu giảm tốc. KHÔNG còn ô nhập riêng trong Properties Panel (đơn giản hoá
  // theo yêu cầu "When Draw" chỉ còn đúng 3 dropdown, không có field ms nào) — luôn dùng giá trị đã
  // lưu (mặc định 150, xem componentRegistry.ts), landing cũ từng chỉnh tay vẫn giữ nguyên giá trị đó.
  revealStaggerMs: number;
  // Trục 3 — hiệu ứng 1 LẦN ngay khi 1 ô vừa chốt xong ký tự thật, CHỈ áp dụng cho rollStyle
  // "flicker" (rollStyle "reel" dùng reelCardEffect/reelNumberEffect riêng ở trên, không dùng field
  // này): "none" = dừng luôn. "bounce" = rơi xuống + nảy nhẹ. "pop" = phóng to 1 chút rồi thu về
  // kích thước ban đầu. KHÔNG còn dropdown riêng trong Properties Panel (cùng đợt bỏ "Effect" ở trên,
  // vốn gộp chung điều khiển cả field này lẫn reelCardEffect/reelNumberEffect qua ĐÚNG 1 dropdown) —
  // component MỚI tạo luôn dùng "pop" (xem componentRegistry.ts), landing CŨ giữ nguyên giá trị đã lưu.
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

// Shape props dùng chung của LiveTextPanel.tsx (Properties Panel) — hiện chỉ WinnerNameProps kế thừa.
export interface LiveTextProps {
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
}

// Hiệu ứng ẨN/HIỆN 1 LẦN — dùng cho CẢ Winner Name lẫn Text (khi bật `syncWithDraw`, xem
// TextProps/TextView.tsx): "Appear" chạy lúc nội dung từ rỗng chuyển sang có (mới được tiết lộ),
// "Disappear" chạy lúc từ có chuyển về rỗng (quay lại Idle/Reset hoặc 1 lượt Draw mới vừa bắt đầu).
// 2 lớp text chồng lên nhau trong lúc chuyển (lớp cũ chạy class "-out", lớp mới chạy class "-in",
// xem WinnerNameView.tsx/TextView.tsx/drawRevealHooks.ts). "none" = đổi tức khắc, không hiệu ứng gì.
export type WinnerTransitionEffect = "none" | "crossfade" | "slideUp" | "slideDown" | "zoom";

export const WINNER_TRANSITION_EFFECTS: WinnerTransitionEffect[] = [
  "none",
  "crossfade",
  "slideUp",
  "slideDown",
  "zoom",
];

// Winner Name luôn ở đúng 1 trong 3 trạng thái (xem useRevealed trong drawRevealHooks.ts):
//   1. Idle — chưa bấm Draw lần nào: ẩn hẳn, không hiện gì (chưa từng có gì để "giữ lại" cả — field
//      `idleState` bên dưới không có tác dụng ở đây, chỉ ảnh hưởng NHÁNH 2 dưới đây). Vừa Reset
//      session (`resetSeq` đổi) trong lúc ĐANG hiện tên của lượt trước — đây mới là lúc `idleState`
//      (xem `DrawRestState` — cùng type với ImageProps/TextProps.drawCycle.idleState) có ý nghĩa:
//        - "disappear" (mặc định/undefined — hành vi cũ): tên đó biến mất sau đúng `idleDelayMs`
//          bằng `idleEffect` — 2 field NÀY RIÊNG, KHÔNG dùng chung `disappearEffect`/`disappearDelayMs`
//          (vốn dành cho Redraw) vì Reset là 1 sự kiện khác hẳn (người vận hành CHỦ ĐỘNG quay lại
//          Idle, không phải đang công bố kết quả mới) — mặc định undefined = ẩn NGAY LẬP TỨC không
//          hiệu ứng.
//        - "appear": GIỮ NGUYÊN tên đang hiện, Reset KHÔNG xoá nó (dùng khi muốn tên người trúng gần
//          nhất tiếp tục hiển thị trang trí cho tới lượt Draw kế tiếp) — `idleEffect`/`idleDelayMs`
//          không có tác dụng gì trong trường hợp này (không có gì đổi để mà chạy hiệu ứng). KHÔNG ảnh
//          hưởng lúc MỞ LẠI landing (app vừa khởi động) — `useRevealed` luôn khởi tạo rỗng lúc mount,
//          tách biệt hoàn toàn khỏi field này, giữ đúng quyết định "Landing luôn mở ở Idle, không
//          restore winner cũ" (xem memory ghi lại quyết định này).
//   2. Bấm Draw LẦN ĐẦU (đang Idle → có candidate): sau đúng `appearDelayMs` tính TỪ LÚC BẤM DRAW,
//      `appearEffect` chạy để hiện tên người trúng.
//   3. Bấm Draw LẦN TIẾP THEO (đang hiện tên của lượt trước): tên CŨ đứng yên tại chỗ cho tới đúng
//      `disappearDelayMs` tính TỪ LÚC BẤM DRAW đó thì `disappearEffect` mới chạy để làm nó biến mất;
//      ĐỘC LẬP (không xếp hàng chờ nhau), tên MỚI cũng hiện ra sau đúng `appearDelayMs` tính từ CÙNG
//      mốc bấm Draw này — cả 2 field Delay đều đo từ đúng 1 sự kiện (bấm Draw/có candidate mới,
//      resultId đổi), không cộng dồn/không phụ thuộc gì vào thời lượng Lucky Wheel quay xong hẳn
//      (khác model cũ — bỏ hẳn, vì công thức thật của từng hiệu ứng quay, đặc biệt Reel/Flicker của
//      DigitRoller, không tính đúng tuyệt đối được, xem wheelRevealDurationMs) — người dùng tự canh 2
//      mốc thời gian này bằng mắt cho khớp hiệu ứng quay thật trên trang.
// 4 field ĐỘC LẬP nhau (không còn 1 field `transitionEffect` dùng chung cho cả 2 chiều như trước).
export interface WinnerNameProps extends LiveTextProps {
  appearEffect: WinnerTransitionEffect;
  disappearEffect: WinnerTransitionEffect;
  // undefined = 0 (hiện/ẩn ngay lập tức, không chờ) — xem doc-comment nhóm field phía trên.
  appearDelayMs?: number;
  disappearDelayMs?: number;
  // Riêng cho lúc Reset (xem doc-comment nhóm field phía trên) — undefined = "disappear" (ẩn NGAY
  // LẬP TỨC, không hiệu ứng — hành vi cũ trước khi có field này).
  idleState?: DrawRestState;
  idleEffect?: WinnerTransitionEffect;
  idleDelayMs?: number;
  // Hiện THAY CHO tên người trúng ngay sau khi 1 Quick Draw vừa chạy xong (xem
  // DrawSequenceActions.quickDrawResult/runDraw trong useDrawSequence.ts) — Quick Draw ra NHIỀU
  // người trúng cùng lúc nên không có 1 cái tên "đúng" nào để hiện, dùng 1 câu chung thay thế. Chỉ
  // Winner Name có field này.
  quickDrawText: string;
  // Cột cụ thể (trong số các cột đang gán Data Type = Name) mà Ô WINNER NAME NÀY đọc — chỉ cần thiết
  // khi 1 session có NHIỀU HƠN 1 cột Name (vd "Tên người chơi" và "Tên người thân"), muốn 2 khung
  // Winner Name khác nhau hiện 2 cột khác nhau. undefined/rỗng = hành vi mặc định (đọc theo cột Name
  // "chính thức" duy nhất, đã resolve sẵn ở server — `results[0].participant_name`, xem
  // WinnerNameView.tsx). KHÔNG bắt buộc phải là cột đang gán Name (nếu Data Type đổi sau khi đã chọn,
  // WinnerNameView vẫn đọc đúng cột đó — chỉ dropdown lọc theo Name lúc CHỌN để tránh chọn nhầm).
  nameSourceColumn?: string;
}

// Hệ hiệu ứng CHUNG cho ảnh giải (Prize Image/Prize Gallery) — 1 danh mục DUY NHẤT dùng ở cả 4 giai
// đoạn tương tác (xem PrizeInteractions bên dưới), chia 3 NHÓM cố định — mỗi nhóm là 1 "kênh" độc
// lập, hiển thị trong Properties Panel (PrizeEffectPicker.tsx):
//   - Focus: scaleUp (phóng to, thay "Zoom" cũ), lift (nâng/dịch theo hướng).
//   - Highlight: glow (viền sáng, thay "Glow" cũ), sweep (ánh sáng quét qua), spotlight (đèn sân khấu
//     chiếu từ đỉnh canvas xuống — xem dưới), dim (tối đi — xem dưới).
//   - Motion: bounce, pulse, shake.
// TRONG CÙNG 1 nhóm chỉ chọn được ĐÚNG 1 effect (hoặc "none" = tắt nhóm đó) — nhưng 3 nhóm hoạt động
// ĐỘC LẬP, nên 1 giai đoạn (vd "Select") có thể BẬT ĐỒNG THỜI cả Focus lẫn Highlight lẫn Motion (tối
// đa 3 effect cùng lúc, mỗi nhóm 1 cái) — xem PrizeStageEffect bên dưới. Xem
// PrizeEffectOverlay.tsx/prizeEffectTransform.ts cho cách vẽ glow/sweep/dim.
//
// "spotlight" — LỊCH SỬ 2 VÒNG: vòng 1 (đèn sân khấu chiếu từ trên xuống, vẽ kiểu polygon/2D lighting
// ngay TRONG PrizeEffectOverlay.tsx như glow/sweep) bị bỏ hẳn vì không ra hướng đẹp (nhìn như hình khối
// phẳng lì). Vòng 2: dựng LẠI hoàn toàn bằng kỹ thuật khác (nón đáy ELIP + mask theo silhouette ảnh +
// drop-shadow, toàn bộ CSS thuần — xem doc-comment `PrizeWonAmbientEffect` CŨ, đã xoá, và
// docs/landing/prize.md mục 4) — LÚC ĐẦU gắn cứng CHỈ cho `onWon` qua field `wonAmbientEffect` riêng
// (TÁCH HẲN khỏi hệ 3-nhóm này), rồi sau đó GỘP LẠI vào đây làm 1 lựa chọn Highlight bình thường, dùng
// được cho CẢ 4 giai đoạn — không còn field `wonAmbientEffect`/`wonAmbientDelayMs` riêng nữa. Vì cần
// `component.x/y/width/height` (vượt ra khỏi khung chính nó, kéo lên tận đỉnh canvas) mà
// `PrizeEffectOverlay.tsx` không có sẵn — effect này KHÔNG vẽ ở đó như glow/sweep/dim, mà vẽ RIÊNG ở
// `PrizeImageView.tsx` (đọc thẳng `resolvePrizeEffects`'s `highlightPersistent`/`highlightOneshot` để
// biết stage nào đang active). Phong cách (màu/hình nón/độ mờ) vẫn CỐ ĐỊNH trong code, không phơi ra
// Panel — chỉ có `delayMs` (field RIÊNG của `PrizeGroupEffect`, xem bên dưới, CHỈ effect này dùng) là
// tuỳ chỉnh được.
// "dim" — thay thế `outOfStockDimAmount` cũ (field NỀN riêng, LUÔN áp dụng khi hết hàng bất kể effect
// nào chọn) — giờ là 1 lựa chọn Highlight bình thường, `size` (0-100, tái dùng field có sẵn của
// `PrizeGroupEffect`) = % tối đi, vẽ ở `PrizeEffectOverlay.tsx` như 1 lớp phủ đen mask theo silhouette
// ảnh (không còn `filter: brightness()` áp lên CẢ khung như bản cũ).
export type PrizeEffectName = "none" | "scaleUp" | "lift" | "glow" | "sweep" | "spotlight" | "dim" | "bounce" | "pulse" | "shake";

export const PRIZE_EFFECT_GROUPS: { key: "focus" | "highlight" | "motion"; label: string; effects: PrizeEffectName[] }[] = [
  { key: "focus", label: "Focus", effects: ["scaleUp", "lift"] },
  { key: "highlight", label: "Highlight", effects: ["glow", "sweep", "spotlight", "dim"] },
  { key: "motion", label: "Motion", effects: ["bounce", "pulse", "shake"] },
];

// Nhóm THỨ 4, TÁCH RIÊNG khỏi 3 nhóm ở trên (Focus/Highlight/Motion — đều dùng chung shape
// PrizeGroupEffect với color/size/direction) vì bản chất khác hẳn: chỉ là 1 công tắc hiện/ẩn, không
// có field phụ nào (màu/kích thước/hướng đều vô nghĩa với "biến mất") — nên dùng type phẳng riêng
// thay vì nhét vào PrizeGroupEffect. "disappear" hiện là lựa chọn DUY NHẤT ngoài "none" — mảng này là
// chỗ thêm lựa chọn mới sau này (vd "fade out" chậm hơn) mà không cần đổi shape.
export type PrizeAppearanceName = "none" | "disappear";
export const PRIZE_APPEARANCE_NAMES: PrizeAppearanceName[] = ["disappear"];

// Cấu hình cho ĐÚNG 1 NHÓM (Focus/Highlight/Motion) trong ĐÚNG 1 giai đoạn — field PHẲNG dùng chung
// cho mọi effect trong nhóm (giống style ButtonProps đã có, không tách interface riêng theo từng
// effect cho gọn). Không phải effect nào cũng dùng hết field:
//   - color: dùng bởi glow (màu quầng sáng).
//   - size: Ý NGHĨA THEO TỪNG EFFECT (panel tự đổi label — xem PrizeEffectPicker.tsx): glow = bán kính
//       lan toả (px) · dim = % tối đi (0-100, thay outOfStockDimAmount cũ) · bounce/pulse/shake = biên
//       độ (px). sweep/spotlight không dùng field này (cố định sẵn). scaleUp VÀ lift ĐỀU không còn
//       dùng field này nữa (bỏ hẳn ô nhập số riêng — mức độ giờ SUY RA từ khoảng cách handleX/Y tới
//       điểm cố định, xem `handleX/Y` bên dưới); giá trị `size` cũ của 1 landing đã lưu TRƯỚC bản đổi
//       này trở thành dữ liệu thừa vô hại cho 2 effect này (scaleUp còn dùng làm fallback 1 LẦN lúc
//       suy ra handleX/Y mặc định — xem resolveScaleHandle trong prizeEffectTransform.ts; lift thì bỏ
//       hẳn, không fallback gì).
//   - delayMs: CHỈ spotlight dùng — chờ bao lâu (ms) SAU KHI giai đoạn này BẮT ĐẦU active mới bắt đầu
//       hiện hiệu ứng (undefined = 0, hiện ngay) — xem PrizeImageView.tsx. Effect còn lại đều bỏ qua
//       field này.
//   - directionX/Y: CHỈ scaleUp dùng — 0-100% mỗi trục, ĐÚNG toạ độ ĐIỂM NEO cố định (kéo-thả trực
//     tiếp trên ảnh thật ở canvas Builder, xem ScaleAnchorOverlay.tsx) — KHÔNG nghịch đảo,
//     transform-origin dùng THẲNG giá trị này (sau khi bám pixel thật gần nhất, xem
//     nearestOpaqueBoxFraction trong pixelAlphaHitTest.ts). lift KHÔNG dùng field này nữa (điểm cố
//     định của lift LUÔN là chính giữa khung, không cần lưu toạ độ riêng — xem `handleX/Y`).
//   - handleX/Y: scaleUp VÀ lift ĐỀU dùng — toạ độ điểm "Direction" (0-100%, CÙNG hệ toạ độ với
//     directionX/Y), kéo-thả trên canvas Builder (xem ScaleAnchorOverlay.tsx). Khoảng cách Euclid từ
//     đây tới ĐIỂM CỐ ĐỊNH của effect đó (scaleUp: directionX/Y, điểm neo do người dùng đặt · lift:
//     LUÔN (50,50) — chính giữa khung theo rectangle vòng ngoài, KHÔNG bám pixel, không đặt được) chính
//     là mức độ effect (scaleUp: % phóng to thêm · lift: px dịch chuyển — cùng quy ước 1:1, xem
//     computePrizeTransform trong prizeEffectTransform.ts); GÓC của vector này với scaleUp CHỈ để vẽ
//     mũi tên trực quan (scale từ 1 điểm neo luôn nở đều mọi hướng), nhưng với lift GÓC CHÍNH LÀ hướng
//     dịch chuyển thật (translate thẳng theo vector đó).
//   - anchorPlaced: CHỈ scaleUp dùng, CHỈ Builder UI đọc (không ảnh hưởng gì tới cách render thật, xem
//     computePrizeTransform) — cờ đánh dấu "đã CHỦ ĐỘNG thả Anchor qua luồng click-để-thả chưa" (xem
//     ScaleAnchorTrigger.tsx/ScaleAnchorOverlay.tsx). `false` (mặc định, và MỌI landing lưu TRƯỚC khi
//     có field này) = panel hiện nút "Drop anchor point", Anchor CHƯA cố định — landing cũ có
//     directionX/Y/handleX/Y đã lưu vẫn RENDER ĐÚNG như cũ (field này không ảnh hưởng runtime), chỉ
//     panel prompt lại người dùng thả Anchor mới nếu muốn dùng luồng kéo-thả trực quan. `true` = Anchor
//     đã cố định, canvas LUÔN hiện pin (tĩnh, không kéo được) khi component đang chọn, panel đổi thành
//     "Edit anchor & direction" + "Remove" — CHO ĐẾN KHI người dùng bấm Remove mới quay lại `false`.
//     lift KHÔNG cần field boolean riêng — điểm cố định LUÔN tồn tại sẵn (không cần "thả"), "đã cấu
//     hình chưa" suy thẳng từ `handleX !== 50 || handleY !== 50` (lệch khỏi tâm = đã kéo).
export interface PrizeGroupEffect {
  effect: PrizeEffectName;
  color: string;
  size: number;
  directionX: number;
  directionY: number;
  handleX: number;
  handleY: number;
  anchorPlaced: boolean;
  delayMs: number;
}

export const DEFAULT_PRIZE_GROUP_EFFECT: PrizeGroupEffect = {
  effect: "none",
  color: "#FFCA2D",
  size: 24,
  directionX: 50,
  directionY: 50,
  // (50,50) = ĐÚNG điểm cố định (giữa tâm) — khoảng cách 0 nghĩa là CHƯA cấu hình gì (0% zoom / 0px
  // dịch chuyển), mặc định trung tính đúng nghĩa cho cả scaleUp lẫn lift. Preset "10% zoom mặc định"
  // khi tạo Prize Image mới KHÔNG đọc từ đây — tự dựng literal riêng trong componentRegistry.ts.
  handleX: 50,
  handleY: 50,
  anchorPlaced: false,
  delayMs: 0,
};

// Cấu hình ĐẦY ĐỦ cho 1 giai đoạn tương tác (When Hover/Select/Won/Out of Stock) — GỘP 3 nhóm ĐỘC
// LẬP, mỗi nhóm tự bật/tắt/chọn effect riêng (xem PrizeGroupEffect) — vd `focus.effect="scaleUp"` VÀ
// `highlight.effect="glow"` CÙNG LÚC là hợp lệ, chỉ riêng TRONG 1 nhóm mới bị giới hạn ĐÚNG 1 effect.
// `appearance` là nhóm THỨ 4 (xem PrizeAppearanceName) — độc lập hoàn toàn với 3 nhóm kia, cũng chỉ
// chọn được 1 giá trị. `hidden` ở ResolvedPrizeEffects (prizeEffectTransform.ts) OR 2 giai đoạn đang
// active (persistent + oneshot) lại — bất kỳ giai đoạn nào đang "disappear" cũng đủ ẩn ảnh.
export interface PrizeStageEffect {
  focus: PrizeGroupEffect;
  highlight: PrizeGroupEffect;
  motion: PrizeGroupEffect;
  appearance: PrizeAppearanceName;
}

// Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này (onHover/onSelect/onWon/onOutOfStock, xem
// PrizeInteractions bên dưới) không hề có 4 field object này trong JSON đã lưu — dù TypeScript khai
// báo chúng là BẮT BUỘC (không `?`), lúc đọc THẬT ở runtime từ config cũ chúng vẫn là `undefined`
// (config lưu bởi bản TRƯỚC redesign 3-nhóm này cũng rơi vào cùng tình huống — object đó CÓ tồn tại
// nhưng thiếu hẳn `focus`/`highlight`/`motion`, đọc `value.focus` ra `undefined` y hệt). MỌI nơi đọc
// 4 field này (PrizeImageView.tsx/LiveImagePanel.tsx/PrizeEffectPicker.tsx) PHẢI fallback về hằng số
// này (`?? DEFAULT_PRIZE_STAGE_EFFECT`), và mỗi nhóm
// con bên trong PHẢI fallback riêng về `DEFAULT_PRIZE_GROUP_EFFECT` — thiếu bước này gây crash trắng
// màn hình ngay khi mở Properties Panel của prize cũ (đã gặp thật: `value.effect` ném lỗi vì `value`
// là `undefined`).
export const DEFAULT_PRIZE_STAGE_EFFECT: PrizeStageEffect = {
  focus: DEFAULT_PRIZE_GROUP_EFFECT,
  highlight: DEFAULT_PRIZE_GROUP_EFFECT,
  motion: DEFAULT_PRIZE_GROUP_EFFECT,
  appearance: "none",
};

// 4 giai đoạn user tương tác với 1 prize (Prize Image, xem PrizeEffectPicker.tsx cho UI cấu hình) —
// chia 2 KIỂU CHẠY khác nhau (xem PrizeEffectOverlay.tsx/prizeEffectTransform.ts):
//   - onWon: 1 KHOẢNH KHẮC rời rạc → hiệu ứng chạy ĐÚNG 1 LẦN rồi tắt (mode="oneshot"), đúng lúc
//     Wheel VỪA TRẢ VỀ người trúng giải này (candidate.prizeId === prizeId), KHÔNG đợi Confirm thật
//     sự chạy — xem doc-comment justWon trong PrizeImageView.tsx.
//   - onHover/onSelect/onOutOfStock: 1 TRẠNG THÁI kéo dài → hiệu ứng chạy LIÊN TỤC suốt trạng thái đó
//     (mode="persistent"), ưu tiên onOutOfStock > onSelect > onHover khi trùng nhau (vd đang hover 1
//     giải ĐÃ hết hàng thì hiện onOutOfStock, không phải onHover — xem PrizeImageView.tsx). onHover áp
//     dụng khi di chuột GẦN/VÀO (chỉ lúc CHƯA chọn — click chính là hành động CHỌN, nên "When Click" và
//     "When Select" là 1, không tách riêng); onSelect áp dụng suốt lúc giải này CỤ THỂ đang là giải
//     được chọn; onOutOfStock áp dụng suốt lúc hết hàng/không active, LAYER THÊM lên trên
//     `outOfStockDimAmount`.
export type PrizeStageKey = "onHover" | "onSelect" | "onWon" | "onOutOfStock";

// Pin Anchor/Direction (scaleUp) HOẶC pin Direction quanh điểm cố định chính giữa (lift) nào đang HIỆN
// trên canvas Builder (LandingCanvas.tsx) — không phải trong Properties Panel (xem
// ScaleAnchorTrigger.tsx/LiftDirectionTrigger.tsx/ScaleAnchorOverlay.tsx). `componentId` + `stageKey`
// xác định ĐÚNG 1 nhóm "focus" đang hiện (group DUY NHẤT chứa CẢ scaleUp lẫn lift, xem
// PRIZE_EFFECT_GROUPS — 2 effect này loại trừ nhau trong cùng 1 nhóm nên dùng CHUNG state này không
// xung đột). State này sống ở LandingBuilderWindow.tsx (cha chung của cả Properties Panel lẫn canvas)
// — CHỈ 1 cặp pin hiện tại 1 lúc trên toàn Builder. `null` = không có gì hiện. Tự đặt lại (không cần
// người dùng bấm gì) mỗi khi đổi vùng chọn sang 1 component KHÁC đã có sẵn cấu hình — xem effect trong
// LandingBuilderWindow.tsx.
export interface AnchorEditTarget {
  componentId: string;
  stageKey: PrizeStageKey;
  // "placing" — CHỈ scaleUp dùng (lift không có điểm neo để "thả" — điểm cố định của lift LUÔN có sẵn
  //   sẵn, chính giữa khung, xem doc-comment PrizeGroupEffect trong types.ts): vừa bấm "Drop anchor
  //   point", CHƯA có Anchor lượt này, canvas chờ ĐÚNG 1 click để "thả" (bám pixel thật gần nhất,
  //   KHÔNG cho rơi vào vùng trong suốt) — xong tự chuyển "editing".
  // "editing" — CHỈ pin Direction kéo-thả tự do được (scaleUp: quanh Anchor cố định · lift: quanh điểm
  //   giữa khung cố định), các component KHÁC trên canvas tạm khoá tương tác (chống chọn nhầm khi 2
  //   prize đặt gần nhau).
  // "locked" — không còn kéo-thả gì (đã bấm "Done" hoặc vừa chọn lại component có sẵn cấu hình) — pin
  //   vẫn HIỆN trên canvas làm tư liệu tham khảo, nhưng THUẦN HIỂN THỊ (không khoá gì, không kéo được)
  //   cho tới khi bấm "Edit" (quay lại "editing") hoặc "Remove"/"Reset" (xoá hẳn, về `null`).
  mode: "placing" | "editing" | "locked";
}

export interface PrizeInteractions {
  onHover: PrizeStageEffect;
  onSelect: PrizeStageEffect;
  onWon: PrizeStageEffect;
  // KHÔNG còn field `outOfStockDimAmount` riêng — độ tối khi hết hàng giờ CHÍNH LÀ effect "dim" của
  // nhóm Highlight (`onOutOfStock.highlight`, `size` = % tối đi), dùng chung cơ chế với 3 giai đoạn
  // còn lại thay vì 1 field nền tách biệt luôn-bật-sẵn (xem doc-comment PrizeEffectName ở trên,
  // componentRegistry.ts đặt mặc định `onOutOfStock` = Dim 58% để giữ đúng cảm giác cũ).
  onOutOfStock: PrizeStageEffect;
}

export interface WinnerNameComponent extends BaseComponent {
  type: "winnerName";
  props: WinnerNameProps;
}

export interface PrizeImageComponent extends BaseComponent {
  type: "prizeImage";
  props: LiveImageProps;
}

// CHỈ dùng bởi PrizeImageComponent — LUÔN hiện đúng 1 giải CỐ ĐỊNH do người dùng chọn (`prizeId`),
// không đổi theo kết quả quay — dùng để đặt NHIỀU Prize Image rải rác khắp landing, mỗi cái tự do
// vị trí/kích thước khớp đúng 1 chỗ trong ảnh nền artwork (vd 1 cái đè lên ảnh xe đẩy, 1 cái đè lên
// ảnh hộp sữa), đại diện đúng 1 giải — KHÔNG sinh thêm ảnh theo quantity của giải. LUÔN cho phép
// hover-glow + click để CHỌN giải đó cho Draw (không có tuỳ chọn tắt — đây CHÍNH LÀ lý do component
// này tồn tại, không phải 1 tính năng phụ) — dùng
// DrawSequenceActions.selectedPrizeId/togglePrizeSelection/notifyOutOfStock đã có (xem
// PrizeImageView.tsx).
// KHÔNG còn field fallback ảnh riêng — ảnh trình chiếu (display_image) giờ BẮT BUỘC phải nhập ở màn
// Prizes (xem PrizeFormModal.tsx), nên Prize Image lấy THẲNG ảnh đó, luôn khớp y nguyên, không cần
// ảnh dự phòng nào khác nữa.
export interface LiveImageProps extends PrizeInteractions {
  fit: "cover" | "contain" | "stretch";
  borderRadius: number;
  prizeId?: string;
}

// Thêm template mới: thêm giá trị vào union này + 1 file trong components/landing/scoreboardTemplates/
// + 1 case trong ScoreboardView.tsx (đúng kiểu LuckyWheelView.tsx đang dispatch theo LuckyWheelTemplate).
export type ScoreboardTemplate = "table";

// 6 field cố định luôn có (participant 4 field chuẩn + prize Category/Name) CỘNG với bất kỳ cột
// optional nào (extra_data) đang thực sự tồn tại trong session — đúng kiểu union "cố định + mở" như
// ParticipantKeyField/ParticipantDisplayField ở trên (xem getParticipantExtraField). Danh sách cột
// optional thực tế được ScoreboardPanel.tsx dò từ participants, không liệt kê cứng ở đây được.
export type ScoreboardField =
  | "participantName"
  | "participantCode"
  | "participantPhone"
  | "participantEmail"
  | "prizeName"
  | "prizeCategory"
  | (string & {});

// Thứ tự trong mảng này CŨNG LÀ thứ tự cột mặc định khi bật (chỉ áp dụng cho 6 field cố định — cột
// optional được ScoreboardPanel.tsx nối thêm vào sau, xem allColumnOptions ở đó).
export const SCOREBOARD_FIELDS: ScoreboardField[] = [
  "participantName",
  "participantCode",
  "participantPhone",
  "participantEmail",
  "prizeName",
  "prizeCategory",
];

const SCOREBOARD_FIELD_LABELS: Partial<Record<string, string>> = {
  participantName: "Name",
  participantCode: "Code",
  participantPhone: "Phone",
  participantEmail: "Email",
  prizeName: "Prize",
  prizeCategory: "Category",
};

// Cột optional (extra_data) không có nhãn dựng sẵn — dùng thẳng tên cột làm nhãn, đúng quy ước đã
// dùng cho Source/Display field của Lucky Wheel (xem allKeyFieldOptions trong LuckyWheelPanel.tsx).
export function getScoreboardFieldLabel(field: ScoreboardField): string {
  return SCOREBOARD_FIELD_LABELS[field] ?? field;
}

// Prefix cho "dòng kết quả giả" mà useDrawSequence.effectiveData độn vào ĐẦU results khi đang có 1
// lượt Draw diễn ra trong phiên Present hiện tại (candidate chưa/đã Confirm nhưng chưa Reset). Chỉ
// dòng mang prefix này mới là "kết quả LIVE": các component tự quay / tự hiện winner
// (WheelTemplate / DigitRollerTemplate / WinnerNameView / TextView, và việc remount theo
// results[0].id trong LandingRenderer) CHỈ phản ứng với nó. Kết quả đọc từ DB khi mở lại 1 phiên đã
// quay dở KHÔNG mang prefix này nên không kích hoạt tự quay / nhảy tên winner khi chưa ai bấm Draw.
// Ngược lại, Scoreboard (TableTemplate.tsx) LỌC BỎ đúng các dòng này vì chúng chưa Confirm.
export const PENDING_RESULT_ID_PREFIX = "pending-";

export function isLiveDrawResultId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PENDING_RESULT_ID_PREFIX);
}

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

// Chữ hiển thị trên nút — KHÔNG còn sửa tay được (đã bỏ ô "Label" khỏi ButtonPanel.tsx): mỗi action
// THẬT có đúng 1 chữ cố định, dùng CHUNG bởi ButtonPanel.tsx (chữ trong dropdown) và ButtonView.tsx
// (chữ render lên nút, xem ButtonProps.label bên dưới). "none"/"draw" không nằm ở đây — "none" đọc
// thẳng `label` (chữ "Button 1"/"Button 2"... tự sinh lúc tạo, xem LandingBuilderWindow.tsx),
// "draw" tự sinh động theo mode/tiến trình (drawButtonLabel trong ButtonView.tsx), không dùng map này.
export const BUTTON_ACTION_LABELS: Partial<Record<ButtonAction, string>> = {
  confirm: "Confirm",
  reset: "Reset",
  toggleScoreboard: "Scoreboard",
  openLink: "Open Link",
};

export interface ButtonProps {
  action: ButtonAction;
  urlField?: string; // chỉ dùng khi action = "openLink"
  // Nghỉ (ms) SAU khi 1 người vừa Confirm xong, TRƯỚC khi pick người tiếp theo — CHỈ áp dụng cho chế
  // độ Multiple Draw (xem DrawMenu/DrawSequenceActions.runDraw trong ButtonView.tsx/types.ts). Quick
  // Draw không nghỉ gì (luôn chạy nhanh nhất có thể, không đọc field này). Chỉ dùng khi action =
  // "draw" — đọc trực tiếp từ component.props ngay lúc bấm Draw (không cần "arm" cùng lúc chọn mode
  // trong dropdown), nên đổi số ở Properties Panel có hiệu lực ngay từ lượt Multiple Draw kế tiếp.
  multipleDrawPaceMs?: number;
  // CHỈ còn ý nghĩa lúc action = "none" (chữ "Button 1"/"Button 2"... tự sinh lúc tạo mới, xem
  // LandingBuilderWindow.tsx) — mọi action thật khác đều tự hiện chữ cố định theo action
  // (BUTTON_ACTION_LABELS ở trên, hoặc drawButtonLabel động riêng cho "draw"), KHÔNG đọc field này
  // nữa. Vẫn giữ trong props (không xoá field) để landing đã lưu từ trước không lỗi type, và để
  // ButtonView.tsx còn chữ dùng lúc action = "none".
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
  | BackgroundComponent
  | LuckyWheelComponent
  | WinnerNameComponent
  | PrizeImageComponent
  | CurrentTimeComponent
  | ParticipantCountComponent
  | ButtonComponent
  | ScoreboardComponent;

export type LandingComponentType = LandingComponent["type"];

export interface LandingConfig {
  version: 1;
  canvas: {
    width: number; // cố định 1920 ở v1
    height: number; // cố định 1080 ở v1 (16:9)
  };
  components: LandingComponent[];
}

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  version: 1,
  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  components: [],
};

// Hình dạng `canvas.background` cũ (trước khi Background trở thành 1 component kéo-thả bình thường
// như Image) — CHỈ dùng để migrate landing đã lưu trước đây, không còn xuất hiện ở LandingConfig hiện
// tại. Type "color" bị bỏ hẳn (không migrate — canvas giờ mặc định luôn đen, xem LandingRenderer.tsx).
interface LegacyBackgroundConfig {
  type?: "color" | "image";
  imageDataUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
}

/** Parse an toàn — bất kỳ lỗi/thiếu field nào cũng rơi về config rỗng thay vì crash Builder/Present Mode. */
export function parseLandingConfig(raw: string | null): LandingConfig {
  if (!raw) return DEFAULT_LANDING_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.components) && parsed.canvas) {
      return migrateLegacyBackground(parsed);
    }
    return DEFAULT_LANDING_CONFIG;
  } catch {
    return DEFAULT_LANDING_CONFIG;
  }
}

// Landing lưu TRƯỚC khi có Background component có thể còn `canvas.background` kiểu ảnh — chuyển
// NGUYÊN ảnh đó thành 1 BackgroundComponent phủ kín canvas (id cố định để parse lại không tạo trùng),
// zIndex thấp nhất để luôn nằm dưới mọi component khác đã có trên trang. Type "color" (không có ảnh)
// không migrate gì — canvas tự động thành nền đen mặc định.
function migrateLegacyBackground(parsed: LandingConfig & { canvas: { background?: LegacyBackgroundConfig } }): LandingConfig {
  const legacy = parsed.canvas.background;
  const { background: _legacyBackground, ...canvas } = parsed.canvas;
  const alreadyMigrated = parsed.components.some((c) => c.id === "bg-migrated");
  if (legacy?.type === "image" && legacy.imageDataUrl && !alreadyMigrated) {
    const bgComponent: BackgroundComponent = {
      id: "bg-migrated",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      zIndex: -1,
      effect: "none",
      type: "background",
      props: { srcDataUrl: legacy.imageDataUrl, fit: legacy.imageFit ?? "cover" },
    };
    return { ...parsed, canvas, components: [bgComponent, ...parsed.components] };
  }
  return { ...parsed, canvas };
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

/** Trang có ÍT NHẤT 1 component cho phép chọn giải để Draw (Prize Image — LUÔN cho chọn, không có
 * tuỳ chọn tắt) hay không — dùng để quyết định Draw có BẮT BUỘC phải chọn giải trước hay không (xem
 * useDrawSequence.ts's pick()). Trang KHÔNG có component nào như vậy thì Draw vẫn random có trọng số
 * như cũ, không bắt buộc gì cả — chỉ khi người dùng đã chủ động thêm UI chọn giải vào trang thì mới
 * bắt buộc dùng nó trước khi quay. */
export function hasSelectablePrizeUI(components: LandingComponent[]): boolean {
  return components.some((c) => c.type === "prizeImage");
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

/** ColumnType của Data Editor (xem src/lib/dataEditor/validate.ts) — khai báo lại ở đây vì
 * landing/types.ts không import được từ dataEditor/ (2 nhánh độc lập của renderer, tránh phụ thuộc
 * chéo không cần thiết giữa 2 tính năng). Sửa 1 bên nhớ soi lại bên kia nếu đổi logic resolve. */
export type ParticipantColumnType = "text" | "name" | "phone" | "email" | "code" | "url";
const RESOLVABLE_CORE_FIELDS = ["name", "phone", "code", "email"] as const;

function defaultParticipantColumnType(col: string): ParticipantColumnType {
  if (col === "name") return "name";
  if (col === "phone") return "phone";
  if (col === "email") return "email";
  if (col === "code") return "code";
  return "text";
}

/** Core field nào trong TOÀN BỘ danh sách participants đang có dữ liệu thật — dùng làm điều kiện
 * "core field đang active" khi resolve, khớp đúng những gì Data Editor đang hiện cho người vận hành
 * thấy (xem isCoreFieldActive trong dataEditor/validate.ts). Tính 1 lần, dùng lại cho nhiều lượt resolve. */
export function computeActiveParticipantCoreFields(
  participants: import("@/types").Participant[]
): Set<(typeof RESOLVABLE_CORE_FIELDS)[number]> {
  const active = new Set<(typeof RESOLVABLE_CORE_FIELDS)[number]>();
  for (const col of RESOLVABLE_CORE_FIELDS) {
    if (participants.some((p) => (getParticipantField(p, col) || "").trim())) active.add(col);
  }
  return active;
}

/**
 * Resolve giá trị "Name"/"Phone"/"Code"/"Email" thật của 1 participant theo cột đang được Data
 * Editor gán Data Type tương ứng — KHÔNG đọc cứng participant.name/.phone/... Dùng cho Winner Name/
 * Scoreboard ở Present Mode, thay cho việc giả định field cố định luôn đúng (xem
 * docs/participants/column-mapping.md, docs/architecture/draw-engine.md). `participant_name` của
 * draw_results/DrawCandidate (từ server) đã tự resolve kiểu này rồi — hàm này dùng cho phần renderer
 * còn lại (candidate CHƯA commit, xem useDrawSequence.ts's effectiveData).
 */
export function resolveParticipantDisplayField(
  p: import("@/types").Participant,
  columnTypesJson: string | null | undefined,
  activeCoreFields: ReadonlySet<string>,
  type: ParticipantColumnType
): string {
  let columnTypes: Record<string, ParticipantColumnType> = {};
  if (columnTypesJson) {
    try {
      columnTypes = JSON.parse(columnTypesJson);
    } catch {
      columnTypes = {};
    }
  }
  for (const col of RESOLVABLE_CORE_FIELDS) {
    if (!activeCoreFields.has(col)) continue;
    if ((columnTypes[col] ?? defaultParticipantColumnType(col)) === type) return getParticipantField(p, col);
  }
  for (const [col, t] of Object.entries(columnTypes)) {
    if (t === type && !(RESOLVABLE_CORE_FIELDS as readonly string[]).includes(col)) {
      const v = getParticipantExtraField(p, col);
      if (v) return v;
    }
  }
  if (type === "name" || type === "phone" || type === "code" || type === "email") return getParticipantField(p, type);
  return "";
}

/** Đọc giá trị 1 field của Lucky Wheel (drawField/displayField/winnerDisplayField) — CHUNG cho cả
 * 2 dạng field mà LuckyWheelPanel.tsx cho chọn: "name"/"phone"/"email"/"code" (label chung, phải
 * resolve qua Data Type — xem resolveParticipantDisplayField, KHÔNG đọc cứng participant.name/...)
 * và tên cột optional cụ thể do người dùng tự chọn thẳng từ extra_data (đọc thẳng qua
 * getParticipantField, không cần resolve gì thêm) hoặc "participantId". Dùng ở WheelTemplate.tsx/
 * DigitRollerTemplate.tsx/displayValue.ts thay cho getParticipantField trực tiếp — xem
 * docs/architecture/draw-engine.md ("không đọc cứng p.name"). */
export function resolveWheelField(
  p: import("@/types").Participant,
  field: string,
  columnTypesJson: string | null | undefined,
  activeCoreFields: ReadonlySet<string>
): string {
  if (field === "name" || field === "phone" || field === "email" || field === "code") {
    return resolveParticipantDisplayField(p, columnTypesJson, activeCoreFields, field);
  }
  return getParticipantField(p, field as ParticipantKeyField);
}

/** Liệt kê MỌI tên cột (core lẫn extra) đang gán đúng 1 `type` — dùng cho dropdown "Source" (vd
 * WinnerNameProps.nameSourceColumn) khi 1 session có nhiều hơn 1 cột cùng type (vd 2 cột Name). Core
 * field đứng trước (chỉ tính nếu đang active — có dữ liệu thật), rồi tới cột extra theo đúng thứ tự
 * xuất hiện trong `columnTypesJson`. Khác `resolveParticipantDisplayField` (trả 1 giá trị ĐÃ RESOLVE
 * của 1 participant) — hàm này trả DANH SÁCH TÊN CỘT, không đụng tới dữ liệu participant nào cả. */
export function listParticipantColumnsForType(
  columnTypesJson: string | null | undefined,
  activeCoreFields: ReadonlySet<string>,
  type: ParticipantColumnType
): string[] {
  let columnTypes: Record<string, ParticipantColumnType> = {};
  if (columnTypesJson) {
    try {
      columnTypes = JSON.parse(columnTypesJson);
    } catch {
      columnTypes = {};
    }
  }
  const cols: string[] = [];
  for (const col of RESOLVABLE_CORE_FIELDS) {
    if (activeCoreFields.has(col) && (columnTypes[col] ?? defaultParticipantColumnType(col)) === type) cols.push(col);
  }
  for (const [col, t] of Object.entries(columnTypes)) {
    if (t === type && !(RESOLVABLE_CORE_FIELDS as readonly string[]).includes(col)) cols.push(col);
  }
  return cols;
}

// Gói dữ liệu sống (participants/prizes/kết quả quay) — 1 nơi fetch/poll duy nhất
// (xem useLandingData.ts), truyền xuống mọi view "động" (luckyWheel, winnerName...) qua LandingRenderer.
// Text/Image ở Phase 1-2 không cần, nhưng chữ ký LandingRenderer nhận sẵn để các phase sau không
// phải đổi lại props của LandingRenderer.
export interface LandingData {
  participants: import("@/types").Participant[];
  prizes: import("@/types").Prize[];
  results: import("@/types").DrawResultRow[];
  // session.participant_column_types — cần cho Lucky Wheel resolve đúng cột nào đang gán Data Type
  // Name/Phone/Email/Code (xem resolveWheelField bên dưới), không đọc cứng participant.name/.phone/....
  columnTypesJson: string | null;
  // true khi đang chạy Quick Draw (results[0].id đổi liên tục không nghỉ, xem runQuickDrawInternal
  // trong useDrawSequence.ts) — không có 1 người trúng "đúng" nào để quay/hiện riêng lẻ, dùng để
  // DigitRollerTemplate hiện placeholder tĩnh ("-") thay vì cố quay theo từng người trúng.
  quickDrawActive?: boolean;
}

// 4 field cố định của Participant — luôn tồn tại kể cả khi bảng rỗng.
const FIXED_PARTICIPANT_FIELDS = ["name", "phone", "code", "email"];

/** Tập tên cột Participant đang THỰC SỰ tồn tại: 4 field cố định + mọi key extra_data xuất hiện ở ít
 * nhất 1 dòng. Dùng để phát hiện component Landing đang bind vào 1 cột đã bị xoá trong Data Editor. */
export function availableParticipantColumns(participants: import("@/types").Participant[]): Set<string> {
  const cols = new Set<string>(FIXED_PARTICIPANT_FIELDS);
  for (const p of participants) {
    if (!p.extra_data) continue;
    try {
      for (const k of Object.keys(JSON.parse(p.extra_data) as Record<string, unknown>)) cols.add(k);
    } catch {
      /* ignore */
    }
  }
  return cols;
}

/** Các cột Participant mà 1 component đang bind tới NHƯNG không còn tồn tại (xem
 * availableParticipantColumns). Rỗng = ổn. Chỉ xét các loại component thật sự bind cột:
 * Lucky Wheel (drawField/displayField/winnerDisplayField), Scoreboard (columns), Button openLink
 * (urlField). "participantId" là khoá nội bộ, luôn hợp lệ — cũng như 6 field CỐ ĐỊNH của Scoreboard
 * (`SCOREBOARD_FIELDS`: participantName/participantCode/participantPhone/participantEmail/prizeName/
 * prizeCategory) KHÔNG phải tên cột Participant thật, mà là khoá resolve thẳng từ DrawResultRow/Prize
 * (xem valueOf trong TableTemplate.tsx) — kiểm chúng bằng availableParticipantColumns SAI HOÀN TOÀN
 * (2 hệ tên khác nhau: "participantName" không bao giờ trùng "name"), sẽ luôn báo "not found" oan cho
 * MỌI Scoreboard bật cột mặc định (bug đã gặp thật). Chỉ cột optional (extra_data) người dùng tự
 * chọn thêm SAU 6 field cố định mới cần kiểm tra còn tồn tại hay không. */
export function missingColumnBindings(component: LandingComponent, available: Set<string>): string[] {
  const check = (f: unknown): f is string =>
    typeof f === "string" && f !== "" && f !== "participantId" && !available.has(f);
  const out = new Set<string>();
  if (component.type === "luckyWheel") {
    for (const f of [component.props.drawField, component.props.displayField, component.props.winnerDisplayField]) {
      if (check(f)) out.add(f);
    }
  } else if (component.type === "scoreboard") {
    for (const f of component.props.columns) {
      if ((SCOREBOARD_FIELDS as string[]).includes(f)) continue;
      if (check(f)) out.add(f);
    }
  } else if (component.type === "button" && component.props.action === "openLink") {
    if (check(component.props.urlField)) out.add(component.props.urlField as string);
  }
  return [...out];
}

// 3 chế độ khi bấm nút Draw chính — chọn qua dropdown mũi tên cạnh nút (ButtonView.tsx's DrawMenu),
// xem DrawSequenceActions.drawMode/selectDrawMode bên dưới. "single" = hành vi Draw gốc (1 người/lượt
// bấm, tự thủ công Confirm/Redo). "multiple"/"quick" đều thao tác N người trên ĐÚNG 1 giải đã chọn —
// khác nhau ở tốc độ: multiple hiện tuần tự từng người rồi tự Confirm, quick chạy hết ngay lập tức.
export type DrawMode = "single" | "multiple" | "quick";

// Trạng thái + hành động của luồng Draw/Confirm/Redo — xem useDrawSequence.ts (nơi triển khai
// thật) và ButtonView.tsx (nơi tiêu thụ). Khai báo shape ở đây (lớp dữ liệu) thay vì để ButtonView
// import thẳng kiểu trả về của hook, giữ đúng phân lớp "views/ chỉ biết shape dữ liệu, không biết
// hook nào tạo ra nó".
export interface DrawSequenceActions {
  candidate: import("@/types").DrawCandidate | null;
  isPending: boolean; // đã pick nhưng chưa confirm — Draw bị khoá, Confirm/Redo mở
  busy: boolean; // đang có 1 lời gọi IPC dở dang — khoá cả 3 nút tránh bấm chồng
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
  // Tăng thêm 1 mỗi lần resetSession() chạy xong thật sự (không tăng nếu bị chặn bởi busy/spinning
  // hay lỗi IPC) — tín hiệu TƯỜNG MINH cho WinnerNameView.tsx/TextView.tsx tự ép về Idle ("" ngay
  // lập tức) NGAY LÚC Reset, không đợi suy luận qua results[0].id đổi (vốn phụ thuộc đúng thời điểm
  // `data` refresh xong, dễ lệch nhịp nếu có request refresh cũ hơn trả về sau — xem useRevealed
  // trong drawRevealHooks.ts). Chỉ dùng để SO SÁNH đổi khác hay không (qua useRef), giá trị số không
  // có ý nghĩa gì khác.
  resetSeq: number;
  // Popup xác nhận chung — dùng cho action "confirm"/"reset" của Button (2 action ghi dữ liệu THẬT,
  // VĨNH VIỄN, xem docs/landing/button-actions.md), tránh bấm nhầm giữa lúc trình chiếu trực tiếp.
  // ButtonView.tsx gọi requestConfirm(message, action) THAY VÌ chạy action ngay — action thật (vd
  // sequence.confirm()) chỉ chạy SAU KHI resolveConfirmPrompt(true) từ nút "Confirm" trên popup (vẽ
  // ở LandingRenderer.tsx, đọc confirmPrompt). resolveConfirmPrompt(false) (nút Cancel/bấm ra ngoài)
  // chỉ đóng popup, không chạy gì. Thuần UI cục bộ, không liên quan IPC/busy.
  // `holdMs` (optional) — action nào phá dữ liệu NẶNG hơn hẳn "confirm 1 người" (hiện chỉ "reset":
  // xoá SẠCH draw_results + trả prizes.remaining về gốc cho CẢ session, xem resetSession) thì bắt
  // GIỮ nút Confirm đúng `holdMs` (không phải bấm 1 phát) mới thật sự chạy — xem HoldToConfirmButton
  // trong LandingRenderer.tsx. undefined = giữ nguyên popup Cancel/Confirm bấm 1 phát như cũ (action
  // "confirm" 1 người trúng).
  // `confirmLabel` (optional) — chữ trên nút xác nhận, mặc định "Confirm" (LandingRenderer.tsx tự
  // fallback) — action "confirm"/"reset" giữ nguyên "Confirm" vì đúng nghĩa đen; case Draw đang
  // pending đổi giải (xem ButtonView.tsx) PHẢI đặt chữ khác ("Draw Anyway") vì bản thân câu hỏi đã
  // nói về việc KHÔNG confirm người trúng cũ — để nút vẫn ghi "Confirm" sẽ gây hiểu lầm ngược nghĩa.
  confirmPrompt: { message: string; holdMs?: number; confirmLabel?: string } | null;
  requestConfirm: (message: string, action: () => void, holdMs?: number, confirmLabel?: string) => void;
  resolveConfirmPrompt: (confirmed: boolean) => void;
  // Giải đang được CHỌN qua PrizeImageView.tsx (click 1 ảnh giải) — khác null thì pick() TRUYỀN
  // THẲNG vào lockedPrizeId đã có sẵn ở electron/drawEngine.ts, ép Draw chỉ random người TRONG đúng
  // giải này (thay vì random có trọng số toàn bộ giải còn hàng như mặc định). togglePrizeSelection
  // gọi lại đúng id đang chọn = bỏ chọn; gọi id khác = CHUYỂN sang giải đó luôn, không cần bỏ chọn
  // giải cũ trước.
  selectedPrizeId: string | null;
  togglePrizeSelection: (prizeId: string) => void;
  // Popup thông báo dùng CHUNG cho mọi trường hợp "bấm 1 nút nhưng không làm được gì, cần biết vì
  // sao" — khác null = đang cần hiện (xem LandingRenderer.tsx), dismiss-only (chỉ có nút OK, click
  // nền tối/Esc cũng đóng). Nguồn gọi hiện có: notifyOutOfStock() (PrizeImageView.tsx, người dùng
  // CHỦ ĐỘNG click 1 giải đã xám), và trực tiếp trong
  // useDrawSequence.ts's pick()/confirm() khi bấm Draw mà chưa chọn giải (trang có UI chọn giải) hoặc
  // bấm Confirm mà chưa có ai được quay (candidate null/đã confirm rồi). KHÔNG tự bật khi giải đang
  // chọn vừa hết hàng (đã bỏ — gây mất trải nghiệm thị giác ngay lúc Wheel vừa quay xong) —
  // useDrawSequence.ts vẫn tự âm thầm bỏ chọn giải đó lúc đó, không kèm popup.
  infoPrompt: string | null;
  // Hàm CHUNG để bật popup này với message tuỳ ý — notifyOutOfStock() chỉ là 1 cách gọi RIÊNG đã có
  // sẵn format câu cố định ("... is out of stock!"). Button action "openLink" (ButtonView.tsx) dùng
  // THẲNG hàm này khi chưa có winner/winner không có link — trước đây no-op im lặng, đổi thành popup
  // vì "bấm không thấy gì" khiến người vận hành tưởng nút bị lỗi (đã gặp thật).
  showInfoPrompt: (message: string) => void;
  notifyOutOfStock: (prizeName: string) => void;
  dismissInfoPrompt: () => void;
  // Đang trong khoảng Lucky Wheel quay (từ lúc có candidate mới tới đúng lúc animation quay xong hẳn
  // — cùng mốc winnerRevealDelayMs dùng cho WinnerNameView, xem computeWheelRevealDelayMs trong file
  // này) — gần như MỌI thao tác bị khoá trong lúc này (Button
  // action nào cũng no-op, xem ButtonView.tsx; chọn/bỏ chọn giải cũng bị khoá, xem PrizeImageView.tsx
  // — giải ĐANG chọn giữ nguyên, không đổi được cho tới khi quay xong). Trang không có Lucky Wheel
  // nào thì gần như luôn false ngay (winnerRevealDelayMs = 0).
  // Multiple/Quick Draw (xem batchProgress bên dưới) CŨNG giữ `spinning = true` SUỐT cả quá trình —
  // batch draw về bản chất là 1 dạng mở rộng của "đang quay", tái dùng NGUYÊN VẸN mọi điểm khoá đã
  // đọc field này (không cần thêm field khoá riêng cho batch).
  spinning: boolean;
  // Khác null = đang chạy Multiple/Quick Draw (xem runDraw bên dưới, triển khai ở useDrawSequence.ts)
  // — ButtonView.tsx đọc để hiện tiến trình "Drawing N/M…" thay cho label cấu hình.
  batchProgress: { mode: "multiple" | "quick"; current: number; total: number } | null;
  // Kết quả Quick Draw VỪA CHẠY XONG — còn hiệu lực tới khi có 1 lượt pick()/redo()/runDraw() (chế độ
  // multiple/quick khác)/resetSession() MỚI (tự clear ở đầu các hàm đó). WinnerNameView.tsx đọc field
  // này (qua prop `quickDrawActive`, LandingRenderer.tsx truyền `!!quickDrawResult`) để hiện
  // `quickDrawText` thay vì tên người trúng — Quick Draw ra nhiều người cùng lúc nên không có 1 tên
  // "đúng" nào để hiện.
  quickDrawResult: { count: number; prizeName: string } | null;
  // Chế độ Draw ĐANG ĐƯỢC ARM — chọn qua dropdown mũi tên cạnh nút Draw (ButtonView.tsx's DrawMenu,
  // có dấu tick cạnh mục đang chọn). Dropdown chỉ CẤU HÌNH (selectDrawMode/confirmDrawModePrompt bên
  // dưới), KHÔNG tự chạy gì — nút Draw CHÍNH mới thật sự thực thi đúng chế độ này khi được bấm (xem
  // runDraw bên dưới). "single" luôn có drawCount = null; "multiple"/"quick" luôn có drawCount là số
  // đã nhập ở drawModePrompt.
  drawMode: DrawMode;
  drawCount: number | null;
  // Bấm 1 mục trong dropdown — "single" set thẳng ngay (không cần hỏi gì). "multiple"/"quick" BẮT
  // BUỘC đã chọn giải + còn hàng (không phụ thuộc requiresPrizeSelection, khác Single Draw) rồi mới
  // mở drawModePrompt hỏi số lượng — không hợp lệ thì báo NGAY qua infoPrompt/notifyOutOfStock, không
  // mở popup nhập số vô nghĩa.
  selectDrawMode: (mode: DrawMode) => void;
  // Popup nhập số lượng cho Multiple/Quick Draw — khác null = đang cần hiện (vẽ ở LandingRenderer.tsx
  // qua DrawModeCountPopup.tsx, CÙNG kiểu overlay canh giữa canvas với confirmPrompt/infoPrompt, chỉ
  // khác có thêm 1 ô nhập số). `max` = remaining hiện tại của giải đang chọn, dùng làm giới hạn trên
  // cho input — nhập quá thì popup tự hiện cảnh báo NGAY (không cần đóng/mở lại). Popup này BẮT BUỘC
  // sống trong LandingRenderer.tsx vì cần phủ toàn bộ canvas đã scale, 1 Button riêng lẻ không có
  // toạ độ đó.
  drawModePrompt: { mode: "multiple" | "quick"; prizeName: string; max: number } | null;
  closeDrawModePrompt: () => void;
  // ARM drawMode/drawCount theo đúng lựa chọn trong popup rồi đóng nó lại — CHƯA chạy gì cả, chỉ lưu
  // cấu hình. Người vận hành phải tự bấm nút Draw chính để thật sự tiến hành quay.
  confirmDrawModePrompt: (count: number) => void;
  // Hàm THẬT SỰ chạy khi bấm nút Draw chính (ButtonView.tsx) — rẽ nhánh theo drawMode đang ARM:
  // "multiple"/"quick" chạy batch với drawCount đã lưu (tự re-validate count/remaining MỚI NHẤT,
  // phòng trường hợp đổi từ lúc arm tới lúc bấm Draw); "single" giữ NGUYÊN hành vi cũ — đang có
  // candidate CHỜ CONFIRM (isPending) thì "quay lại" (redo), chưa có gì chờ thì pick() 1 candidate
  // mới. Ngoại lệ: đang pending giải A mà `selectedPrizeId` đã đổi sang giải B cụ thể (khác hẳn case
  // "unselect" — xem redo() trong useDrawSequence.ts) thì HUỶ candidate A rồi pick() thẳng cho B,
  // không redo() nhầm giải A — ButtonView.tsx tự hỏi xác nhận "Are you sure" trước khi gọi tới đây.
  // `multipleDrawPaceMs` — ButtonView.tsx truyền thẳng `component.props.multipleDrawPaceMs` (đọc
  // ngay lúc bấm, không phải lúc arm) — CHỈ có tác dụng khi drawMode === "multiple", bỏ qua hoàn
  // toàn ở "single"/"quick" (Quick Draw không nghỉ gì, xem doc-comment ButtonProps.multipleDrawPaceMs).
  runDraw: (multipleDrawPaceMs?: number) => Promise<void>;
}
