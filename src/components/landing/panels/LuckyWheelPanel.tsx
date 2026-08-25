import { useMemo, useState } from "react";
import {
  getParticipantExtraField,
  getParticipantField,
  LuckyWheelProps,
  LuckyWheelTemplate,
  ParticipantDisplayField,
  ParticipantKeyField,
} from "@/lib/landing/types";
import { Participant } from "@/types";

interface LuckyWheelPanelProps {
  props: LuckyWheelProps;
  // Dùng để chỉ hiện các field CÓ dữ liệu thật trong session này (vd Email bỏ trống hết thì không
  // cho chọn) — tránh chọn nhầm 1 field rỗng khiến segment/kết quả biến mất hoàn toàn (xem hasData
  // bên dưới và getFieldOptions). Cũng dùng để liệt kê MỌI cột optional (extra_data) đang thực sự
  // tồn tại trong session, không chỉ 4 field cố định — xem extraColumns bên dưới.
  participants: Participant[];
  onChange: (patch: Partial<LuckyWheelProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const TEMPLATE_OPTIONS: { value: LuckyWheelTemplate; label: string }[] = [
  { value: "wheel", label: "Wheel (circular)" },
  { value: "digitRoller", label: "Digit Roller (slot-machine numbers)" },
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
  { value: "Inter, ui-sans-serif, sans-serif", label: "Sans (default)" },
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
export default function LuckyWheelPanel({ props, participants, onChange }: LuckyWheelPanelProps) {
  const isWheel = props.template === "wheel";
  const isDigitRoller = props.template === "digitRoller";
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

  // "name" luôn có dữ liệu (bắt buộc nhập) — phone/email/code/cột optional thì tuỳ session, có thể
  // bỏ trống toàn bộ (vd session này không thu thập email). Chọn field rỗng làm drawField sẽ làm
  // segment biến mất hết (getParticipantField trả về "", bị coi là trùng/loại), displayField/
  // winnerDisplayField rỗng thì hiện chữ trống — cả 2 đều trông như "quay không ra kết quả gì".
  // Chỉ cho chọn field đang thực sự có ít nhất 1 giá trị trong session hiện tại.
  const hasPhone = participants.some((p) => p.phone?.trim());
  const hasEmail = participants.some((p) => p.email?.trim());
  const hasCode = participants.some((p) => p.code?.trim());
  function hasDataForField(field: string): boolean {
    switch (field) {
      case "participantId":
      case "name":
        return true;
      case "phone":
        return hasPhone;
      case "email":
        return hasEmail;
      case "code":
        return hasCode;
      default:
        return participants.some((p) => getParticipantExtraField(p, field));
    }
  }
  // Vẫn giữ field ĐANG được chọn trong danh sách dù nó không còn dữ liệu (vd session vừa xoá hết
  // số điện thoại sau khi đã chọn Phone) — chỉ ẩn các lựa chọn rỗng NGOÀI field đang chọn, tránh
  // <select> hiện trắng/không khớp value nào.
  function availableOptions<T extends { value: string; label: string }>(options: T[], current: string): T[] {
    return options.filter((o) => o.value === current || hasDataForField(o.value));
  }
  const keyFieldOptions = availableOptions(allKeyFieldOptions, props.drawField);
  const displayFieldOptions = availableOptions(allDisplayFieldOptions, props.displayField);
  const winnerFieldOptions = availableOptions(allDisplayFieldOptions, props.winnerDisplayField);

  // ĐỊNH NGHĨA: Digit Roll = quy ước về SỐ LƯỢNG Ô KÝ TỰ (character slots) hiển thị trên màn hình —
  // KHÔNG phải kiểm tra nội dung có phải toàn số hay không. "ENFA0001" (8 ký tự) hợp lệ cho 1
  // Digit Roll 8 ô y hệt "12345678" — Draw Engine chỉ coi mọi giá trị là 1 Identifier, Presentation
  // Layer chỉ quan tâm Identifier đó có ĐÚNG số ký tự để render đủ ô, không phân tích/cắt/lọc nội
  // dung (không bỏ prefix, không chỉ lấy phần số). Điều kiện DUY NHẤT: 100% participant phải có
  // giá trị dài ĐÚNG BẰNG digitCount — ngắn/dài hơn đều không đạt, không có ngưỡng châm chước.
  function rawValueOf(p: Participant, field: ParticipantDisplayField): string {
    return getParticipantField(p, field).trim();
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
  const digitFieldOptions = allDisplayFieldOptions.map((o) => {
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
      const candidate = allDisplayFieldOptions.find(
        (o) => o.value !== "name" && evaluateField(o.value, props.digitCount).enabled
      );
      patch.winnerDisplayField = candidate?.value ?? "phone";
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
          <label className={labelClass}>
            {isDigitRoller
              ? `Source field (exactly ${props.digitCount} characters)`
              : "Winner display field (shown after landing)"}
          </label>
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
              <input
                type="color"
                className="h-[26px] w-full rounded border border-base-700 bg-base-800"
                value={props.fontColor}
                onChange={(e) => onChange({ fontColor: e.target.value })}
              />
            </div>
          </div>
        )}
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
                <option value="linear">Linear (constant speed)</option>
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
                    <option value="flicker">Flicker (random characters)</option>
                    <option value="reel">Reel (spinning scroll)</option>
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
