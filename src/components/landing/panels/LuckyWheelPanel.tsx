import { useEffect, useMemo, useState } from "react";
import {
  computeActiveParticipantCoreFields,
  getParticipantExtraField,
  LuckyWheelProps,
  LuckyWheelTemplate,
  ParticipantDisplayField,
  ParticipantKeyField,
  resolveWheelField,
} from "@/lib/landing/types";
import { Participant } from "@/types";
import ColorField from "./ColorField";

interface LuckyWheelPanelProps {
  props: LuckyWheelProps;
  // Dùng để chỉ hiện các field CÓ dữ liệu thật trong session này (vd Email bỏ trống hết thì không
  // cho chọn) — tránh chọn nhầm 1 field rỗng khiến segment/kết quả biến mất hoàn toàn (xem hasData
  // bên dưới và getFieldOptions). Cũng dùng để liệt kê MỌI cột optional (extra_data) đang thực sự
  // tồn tại trong session, không chỉ 4 field cố định — xem extraColumns bên dưới.
  participants: Participant[];
  // session.participant_column_types — để biết "Name"/"Phone"/"Email"/"Code" (label chung) đang
  // thực sự resolve ra cột nào (xem resolveWheelField) — KHÔNG còn giả định chúng luôn là cột SQL
  // participant.name/.phone/.... (đã bỏ ghi từ khi Participant đổi sang mô hình Data Type, xem
  // CLAUDE.md mục Participant).
  columnTypesJson: string | null;
  // Vị trí/kích thước thật (component.x/y/width/height) — gộp vào "Basic options" ở đây thay vì để
  // riêng dưới SharedFields.tsx, cùng cách đã làm cho Winner Name (xem LiveTextPanel.tsx). Đổi field
  // NÀY phải qua `onChangeComponent` (patch top-level LandingComponent), KHÁC hẳn `onChange` (patch
  // `component.props`).
  x: number;
  y: number;
  width: number;
  height: number;
  onChangeComponent: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  onChange: (patch: Partial<LuckyWheelProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const TEMPLATE_OPTIONS: { value: LuckyWheelTemplate; label: string }[] = [
  { value: "wheel", label: "Wheel" },
  { value: "digitRoller", label: "Digit Roller" },
];

const KEY_FIELD_OPTIONS: { value: ParticipantKeyField; label: string }[] = [
  { value: "participantId", label: "Participant ID" },
  { value: "code", label: "Code" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
];

const DISPLAY_FIELD_OPTIONS: { value: ParticipantDisplayField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "code", label: "Code" },
];

const FONT_OPTIONS = [
  { value: "Inter, ui-sans-serif, sans-serif", label: "Sans" },
  { value: "Georgia, serif", label: "Serif" },
  { value: "'Courier New', monospace", label: "Monospace" },
];

// Kiểu bảng gọn — tham khảo LiveImagePanel.tsx: nhóm field theo groupLabelClass,
// bỏ hết đoạn text giải thích dài dòng (label + option tự đủ rõ nghĩa; lý do 1 field bị xám vẫn xem
// được qua tooltip khi hover, xem digitFieldOptions bên dưới) — KHÔNG còn field "Draw Session" (chỉ
// hiện tên session hiện tại, không sửa được gì, thừa thãi) và "Name" (đã bỏ khỏi SharedFields.tsx,
// dùng chung cho MỌI loại component chứ không riêng gì Lucky Wheel). "Basic options" GỘP CHUNG cả
// Template lẫn field data-binding cũ (Draw/Display/Winner-Source field, Digit count, Mask phone
// numbers) VÀ field display cũ (Font, Font size, Color) thành 1 nhóm PHẲNG DUY NHẤT (không collapsible,
// không còn tách riêng "Data binding"/"Display" nữa — gộp lại cho gọn) — CÙNG kiểu "menu 2 cấp" + CÙNG
// quy ước đặt tên "When..." với LiveImagePanel.tsx's Self Interactions ở 2 nhóm còn lại (Self
// Interactions LUÔN đứng TRƯỚC Interactions with Draw — tự thân component trước, phản ứng theo sự
// kiện ngoài sau):
//   - "Self Interactions" (LUÔN hiện) → "When Spinning" (Spin Behavior — cách wheel tự quay, không
//     phụ thuộc Draw đã xong hay chưa).
//   - "Interactions with Draw" (CHỈ digitRoller) → "When Draw" (Reveal Animation — phản ứng đúng lúc
//     Draw trả kết quả).
// Mỗi nhóm gồm ĐÚNG 1 <details> con — mở sẵn mặc định (`useState(true)`, không phải `open` tĩnh —
// tránh React ép mở lại mỗi lần re-render, xem revealOpen/spinOpen) vì đây là cấu hình CỐT LÕI, khác
// PrizeEffectPicker.tsx (effect tuỳ chọn thêm, mặc định đóng trừ khi đã cấu hình).
export default function LuckyWheelPanel({
  props,
  participants,
  columnTypesJson,
  x,
  y,
  width,
  height,
  onChangeComponent,
  onChange,
}: LuckyWheelPanelProps) {
  const isWheel = props.template === "wheel";
  const isDigitRoller = props.template === "digitRoller";
  // Digit Roller tự tính height từ width + Digit count (xem fitDigitRollerHeight trong
  // LandingBuilderWindow.tsx) — nhập tay vào đây sẽ bị ghi đè lại ngay, nên khoá hẳn field này thay
  // vì để nó trông như nhập được nhưng lại tự đổi ngược, dễ gây khó hiểu (giữ NGUYÊN đúng hành vi cũ
  // của SharedFields.tsx trước khi Position dời vào đây).
  const heightLocked = isDigitRoller;
  // Mở sẵn mặc định — khác PrizeEffectPicker.tsx (chỉ mở nếu ĐÃ cấu hình gì đó, vì hiệu ứng ở đó là
  // tuỳ chọn thêm) — Reveal Animation/Spin Behavior là cấu hình CỐT LÕI của Wheel, hầu như ai cũng
  // cần thấy ngay. `useState` (không phải "open" tĩnh) để tôn trọng lần đóng thủ công của người dùng
  // — nếu để `open` là 1 giá trị cố định, React ép lại thành true mỗi lần re-render, đóng lại vẫn tự
  // bung ra.
  const [revealOpen, setRevealOpen] = useState(true);
  const [spinOpen, setSpinOpen] = useState(true);

  // Mọi tên cột optional (extra_data) đang THỰC SỰ xuất hiện ở ít nhất 1 participant trong session
  // này — hợp nhất với 4 field cố định để Source/Draw/Display field không còn giới hạn chỉ Name/
  // Phone/Email/Code như trước, đúng yêu cầu "phải hiển thị đủ các trường có thể chọn".
  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    participants.forEach((p) => {
      if (!p.extra_data) return;
      try {
        const extra = JSON.parse(p.extra_data) as Record<string, string>;
        Object.keys(extra).forEach((k) => keys.add(k));
      } catch {
        // extra_data hỏng ở dòng này — bỏ qua, không chặn cả danh sách field
      }
    });
    return Array.from(keys).sort();
  }, [participants]);
  const allKeyFieldOptions = [...KEY_FIELD_OPTIONS, ...extraColumns.map((k) => ({ value: k, label: k }))];
  const allDisplayFieldOptions = [...DISPLAY_FIELD_OPTIONS, ...extraColumns.map((k) => ({ value: k, label: k }))];

  // Cột SQL name/phone/code/email nào đang THỰC SỰ có dữ liệu — dùng chung với isCoreFieldActive
  // của Data Editor (xem computeActiveParticipantCoreFields), KHÔNG hardcode "name" = true như
  // trước nữa: từ khi import flow đưa toàn bộ dữ liệu vào extra_data (xem CLAUDE.md mục
  // Participant), cột SQL participant.name gần như luôn RỖNG — "name" hardcode true khiến label
  // chung "Name" luôn hiện trong dropdown dù participant không có field đó, chọn vào sẽ ra chữ rỗng
  // (bug đã gặp thật). Cột thật (vd "HÃY CHO BIẾT TÊN CỦA BẠN" đã gán Data Type = Name) vẫn hiện
  // riêng qua `extraColumns` bên dưới, không cần dựa vào field cố định này.
  const activeCoreFields = useMemo(() => computeActiveParticipantCoreFields(participants), [participants]);
  // Chọn field rỗng làm drawField sẽ làm segment biến mất hết (resolveWheelField trả về "", bị coi
  // là trùng/loại), displayField/winnerDisplayField rỗng thì hiện chữ trống — cả 2 đều trông như
  // "quay không ra kết quả gì". Chỉ cho chọn field đang thực sự có ít nhất 1 giá trị trong session.
  function hasDataForField(field: string): boolean {
    switch (field) {
      case "participantId":
        return true;
      case "name":
      case "phone":
      case "email":
      case "code":
        return activeCoreFields.has(field);
      default:
        return participants.some((p) => getParticipantExtraField(p, field));
    }
  }
  // "name"/"phone"/"email"/"code" KHÔNG phải cột thật — là label chung, chỉ hợp lệ khi cột SQL cùng
  // tên đó thực sự có dữ liệu (activeCoreFields). Khác cột optional (extra_data): 1 cột optional hết
  // dữ liệu vẫn là 1 cột THẬT (vd session vừa xoá hết số điện thoại ở 1 cột đã có từ trước) nên vẫn
  // đáng giữ lại nếu đang được chọn, tránh <select> hiện trắng. 4 label ảo thì KHÔNG áp dụng ngoại lệ
  // này — giữ 1 label ảo chỉ vì nó "đang được chọn" chính là bug đã gặp thật (field không tồn tại
  // vẫn nằm lại trong dropdown mãi vì chưa ai đổi lựa chọn khác đi).
  function isPhantomGenericField(field: string): boolean {
    return (field === "name" || field === "phone" || field === "email" || field === "code") && !activeCoreFields.has(field);
  }
  function availableOptions<T extends { value: string; label: string }>(options: T[], current: string): T[] {
    return options.filter((o) => {
      if (isPhantomGenericField(o.value)) return false;
      return o.value === current || hasDataForField(o.value);
    });
  }
  const keyFieldOptions = availableOptions(allKeyFieldOptions, props.drawField);
  const displayFieldOptions = availableOptions(allDisplayFieldOptions, props.displayField);
  const winnerFieldOptions = availableOptions(allDisplayFieldOptions, props.winnerDisplayField);

  // Tự chuyển field đang lưu sang 1 cột THẬT ngay khi nó đang trỏ vào 1 label ảo (vd landing cũ lưu
  // "phone" từ trước khi có bản sửa isPhantomGenericField, hoặc mở lại 1 session vừa xoá hết cột
  // Data Type Phone) — khác đứt khoát với cách availableOptions xử lý cột optional hết dữ liệu (vẫn
  // giữ nguyên lựa chọn, không tự đổi): label ảo không phải 1 cột đang "tạm hết dữ liệu", mà là 1
  // field KHÔNG TỒN TẠI, để nó nằm im trong props sẽ khiến dropdown mãi hiện lại 1 field ảo bất cứ
  // khi nào nó tình cờ trùng "current" (bug đã gặp thật, xem isPhantomGenericField).
  useEffect(() => {
    const patch: Partial<LuckyWheelProps> = {};
    if (isPhantomGenericField(props.drawField) && keyFieldOptions[0]) {
      patch.drawField = keyFieldOptions[0].value as ParticipantKeyField;
    }
    if (isPhantomGenericField(props.displayField) && displayFieldOptions[0]) {
      patch.displayField = displayFieldOptions[0].value;
    }
    if (isPhantomGenericField(props.winnerDisplayField) && winnerFieldOptions[0]) {
      patch.winnerDisplayField = winnerFieldOptions[0].value;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.drawField, props.displayField, props.winnerDisplayField, activeCoreFields]);

  // ĐỊNH NGHĨA: Digit Roll = quy ước về SỐ LƯỢNG Ô KÝ TỰ (character slots) hiển thị trên màn hình —
  // KHÔNG phải kiểm tra nội dung có phải toàn số hay không. "ENFA0001" (8 ký tự) hợp lệ cho 1
  // Digit Roll 8 ô y hệt "12345678" — Draw Engine chỉ coi mọi giá trị là 1 Identifier, Presentation
  // Layer chỉ quan tâm Identifier đó có ĐÚNG số ký tự để render đủ ô, không phân tích/cắt/lọc nội
  // dung (không bỏ prefix, không chỉ lấy phần số). Điều kiện DUY NHẤT: 100% participant phải có
  // giá trị dài ĐÚNG BẰNG digitCount — ngắn/dài hơn đều không đạt, không có ngưỡng châm chước.
  function rawValueOf(p: Participant, field: ParticipantDisplayField): string {
    return resolveWheelField(p, field, columnTypesJson, activeCoreFields).trim();
  }
  interface FieldEvaluation {
    enabled: boolean;
    reasons: string[]; // rỗng nếu enabled — có thể nhiều lý do cùng lúc (vd vừa thiếu dữ liệu vừa lệch độ dài)
  }
  function evaluateField(field: ParticipantDisplayField, count: number): FieldEvaluation {
    const raws = participants.map((p) => rawValueOf(p, field));
    const missingCount = raws.filter((v) => v.length === 0).length;
    const lengths = raws.filter((v) => v.length > 0).map((v) => v.length);
    const distinctLengths = Array.from(new Set(lengths)).sort((a, b) => a - b);
    const reasons: string[] = [];
    if (missingCount > 0) {
      reasons.push(`${missingCount} participant${missingCount === 1 ? " has" : "s have"} no value in this field.`);
    }
    if (distinctLengths.length > 1) {
      reasons.push(`Length is inconsistent across participants (${distinctLengths.join(", ")} characters found).`);
    } else if (distinctLengths.length === 1 && distinctLengths[0] !== count) {
      reasons.push(`Values have ${distinctLengths[0]} character${distinctLengths[0] === 1 ? "" : "s"} — need exactly ${count}.`);
    }
    return { enabled: reasons.length === 0 && missingCount === 0 && distinctLengths.length === 1, reasons };
  }
  // Digit Roller không đòi hỏi field phải thuộc 1 Data Type cụ thể — chỉ cần ĐÚNG số ký tự — nên
  // "available" ở đây nghĩa là "cột này thực sự tồn tại trong Participant" (lọc qua
  // availableOptions/hasDataForField, giống displayFieldOptions/winnerFieldOptions phía trên,
  // KHÔNG map thẳng lên allDisplayFieldOptions như trước — đó là lý do Name/Phone/Email/Code ảo
  // vẫn lọt vào dropdown dù participant không có field đó). "Eligible" là lớp lọc THỨ HAI, riêng
  // của Digit Roller, chỉ đúng số ký tự mới đạt.
  const digitFieldOptions = availableOptions(allDisplayFieldOptions, props.winnerDisplayField).map((o) => {
    const evaluation = evaluateField(o.value, props.digitCount);
    return { ...o, ...evaluation };
  });

  function handleTemplateChange(nextTemplate: LuckyWheelTemplate) {
    const patch: Partial<LuckyWheelProps> = { template: nextTemplate };
    // "Name" gần như không bao giờ có cùng độ dài giữa các participant — giữ nguyên khi chuyển
    // sang Digit Roller sẽ hiện field không hợp lệ ngay từ đầu. Tự chuyển sang field đầu tiên (kể
    // cả cột optional) thực sự khớp đúng digitCount đang cấu hình, fallback về "phone" nếu không
    // field nào đạt (người dùng sẽ thấy nó bị xám kèm lý do, tự điều chỉnh Digit count hoặc field).
    if (nextTemplate === "digitRoller" && props.winnerDisplayField === "name") {
      // Chỉ tìm trong các cột THỰC SỰ tồn tại (giống digitFieldOptions phía trên) — không xét
      // Phone/Email/Code ảo nếu participant không có field đó.
      const available = availableOptions(allDisplayFieldOptions, props.winnerDisplayField);
      const candidate = available.find(
        (o) => o.value !== "name" && evaluateField(o.value, props.digitCount).enabled
      );
      patch.winnerDisplayField = candidate?.value ?? available.find((o) => o.value !== "name")?.value ?? "phone";
    }
    onChange(patch);
  }

  // "Effect" — 1 Ô CHUNG, 1 COMBINATION ĐỒNG BỘ cho cả 2 rollStyle, không phải chọn riêng từng lớp:
  // "pop" bật ĐỒNG THỜI cả reelCardEffect ("pop" — khung trắng flash/scale in) LẪN reelNumberEffect
  // ("bounce" — ký tự nảy nhẹ), 2 field gốc luôn ĐI CÙNG NHAU qua field này (không còn bật lẻ được
  // từng cái như trước) — không đổi gì ở DigitRollerTemplate.tsx, vẫn đọc đúng 2 field cũ đó. flicker
  // dùng thẳng field `landingEffect` sẵn có ("bounce" cũ vẫn hợp lệ trong type nhưng KHÔNG còn hiện
  // trong dropdown — trước mắt chỉ 2 lựa chọn None/Pop, "trước mắt" nghĩa là còn mở rộng thêm sau).
  // Landing đã lưu TRƯỚC bản gộp này vẫn chạy ĐÚNG y nguyên (field gốc không đổi) — chỉ riêng lúc
  // HIỂN THỊ, dropdown chỉ coi là "Pop" khi ĐÚNG combination trên, còn lại (kể cả bounce lẻ/legacy
  // không đồng bộ) đều hiện "None".
  const landingEffectValue: "none" | "pop" =
    props.rollStyle === "reel" ? (props.reelCardEffect === "pop" ? "pop" : "none") : props.landingEffect === "pop" ? "pop" : "none";

  function handleLandingEffectChange(value: "none" | "pop") {
    if (props.rollStyle === "reel") {
      onChange({ reelCardEffect: value === "pop" ? "pop" : "none", reelNumberEffect: value === "pop" ? "bounce" : "none" });
    } else {
      onChange({ landingEffect: value });
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div>
          <label className={labelClass}>Template</label>
          <select
            className={fieldClass}
            value={props.template}
            onChange={(e) => handleTemplateChange(e.target.value as LuckyWheelTemplate)}
          >
            {TEMPLATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {isWheel && (
          <>
            <div>
              <label className={labelClass}>Draw field (identifies each segment)</label>
              <select
                className={fieldClass}
                value={props.drawField}
                onChange={(e) => onChange({ drawField: e.target.value as ParticipantKeyField })}
              >
                {keyFieldOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Display field (shown on the wheel)</label>
              <select
                className={fieldClass}
                value={props.displayField}
                onChange={(e) => onChange({ displayField: e.target.value as ParticipantDisplayField })}
              >
                {displayFieldOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className={labelClass}>Source</label>
          <select
            className={fieldClass}
            value={props.winnerDisplayField}
            onChange={(e) => onChange({ winnerDisplayField: e.target.value as ParticipantDisplayField })}
          >
            {isDigitRoller
              ? digitFieldOptions.map((o) => (
                  <option
                    key={o.value}
                    value={o.value}
                    disabled={!o.enabled}
                    // Tooltip HTML title: 1 lý do thì hiện thẳng, nhiều lý do thì xuống dòng + gạch đầu
                    // dòng (title hỗ trợ \n) — đúng yêu cầu định dạng.
                    title={o.enabled ? undefined : o.reasons.length > 1 ? o.reasons.map((r) => `- ${r}`).join("\n") : o.reasons[0]}
                  >
                    {o.label}
                    {o.enabled ? "" : " — not eligible"}
                  </option>
                ))
              : winnerFieldOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
          </select>
        </div>

        {isDigitRoller && (
          <div>
            <label className={labelClass}>Digit count</label>
            <input
              type="number"
              min={1}
              max={10}
              className={fieldClass}
              value={props.digitCount}
              onChange={(e) => onChange({ digitCount: Math.max(1, Number(e.target.value)) })}
            />
          </div>
        )}

        {isWheel && (
          <label className="flex items-center gap-1.5 text-xs text-base-200">
            <input
              type="checkbox"
              checked={props.maskSensitiveData}
              onChange={(e) => onChange({ maskSensitiveData: e.target.checked })}
              className="accent-gold-500"
            />
            Mask phone numbers
          </label>
        )}

        <div>
          <label className={labelClass}>Font</label>
          <select className={fieldClass} value={props.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {isWheel && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Font size</label>
              <input
                type="number"
                className={fieldClass}
                value={props.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <ColorField value={props.fontColor} onChange={(fontColor) => onChange({ fontColor })} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>X</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(x)}
              onChange={(e) => onChangeComponent({ x: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Y</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(y)}
              onChange={(e) => onChangeComponent({ y: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Width</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(width)}
              onChange={(e) => onChangeComponent({ width: Math.max(1, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className={labelClass}>Height{heightLocked ? " (auto)" : ""}</label>
            <input
              type="number"
              disabled={heightLocked}
              title={heightLocked ? "Digit Roller always auto-fits height to width + Digit count" : undefined}
              className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
              value={Math.round(height)}
              onChange={(e) => onChangeComponent({ height: Math.max(1, Number(e.target.value)) })}
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Self Interactions</span>
        <details
          open={spinOpen}
          onToggle={(e) => setSpinOpen(e.currentTarget.open)}
          className="rounded-lg border border-base-800"
        >
          <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100">
            When Spinning
          </summary>
          <div className="space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5">
            <div>
              <label className={labelClass}>Spin duration (ms)</label>
              <input
                type="number"
                step={100}
                min={500}
                className={fieldClass}
                value={props.spinDurationMs}
                onChange={(e) => onChange({ spinDurationMs: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>Spin style</label>
              <select
                className={fieldClass}
                value={props.spinEasing}
                onChange={(e) => onChange({ spinEasing: e.target.value as LuckyWheelProps["spinEasing"] })}
              >
                <option value="linear">Linear</option>
                <option value="easeOut">Fast start, slow stop</option>
                <option value="easeInOut">Smooth start and stop</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      {isDigitRoller && (
        <>
          <div className="h-px bg-base-800" />
          <div className="space-y-2">
            <span className={groupLabelClass}>Interactions with Draw</span>
            <details
              open={revealOpen}
              onToggle={(e) => setRevealOpen(e.currentTarget.open)}
              className="rounded-lg border border-base-800"
            >
              <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100">
                When Draw
              </summary>
              <div className="space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5">
                <div>
                  <label className={labelClass}>Style</label>
                  <select
                    className={fieldClass}
                    value={props.rollStyle ?? "flicker"}
                    onChange={(e) => onChange({ rollStyle: e.target.value as LuckyWheelProps["rollStyle"] })}
                  >
                    <option value="flicker">Flicker</option>
                    <option value="reel">Reel</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Timing</label>
                  <select
                    className={fieldClass}
                    value={props.revealTiming ?? "together"}
                    onChange={(e) => onChange({ revealTiming: e.target.value as LuckyWheelProps["revealTiming"] })}
                  >
                    <option value="together">All characters stop at once</option>
                    <option value="sequential">One at a time, left to right</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Effect</label>
                  <select className={fieldClass} value={landingEffectValue} onChange={(e) => handleLandingEffectChange(e.target.value as "none" | "pop")}>
                    <option value="none">None</option>
                    <option value="pop">Pop</option>
                  </select>
                </div>
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
