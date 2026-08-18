import { ChangeEvent, useEffect, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Prize } from "@/types";

interface PrizeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  sessionId: string;
  editing: Prize | null; // null = thêm mới, có giá trị = đang sửa giải này
}

// Cố định danh sách — trước đây cho gõ tự do (datalist gợi ý), giờ CHỈ CHỌN trong 5 mức này để tên
// category nhất quán giữa các giải (tránh gõ lệch chữ ra nhiều "category" khác nhau cho cùng 1 ý).
const CATEGORY_OPTIONS = ["Grand Prize", "First Prize", "Second Prize", "Third Prize", "Consolation Prize"];

const DEFAULT_FORM = {
  name: "",
  category: "",
  quantity: 1,
  weight: 1,
  allowDuplicateWithOtherPrizes: true,
  allowDuplicateWithSamePrize: false,
  maxWinCount: 1,
};

export default function PrizeFormModal({
  open,
  onClose,
  onSaved,
  sessionId,
  editing,
}: PrizeFormModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category ?? "",
        quantity: editing.quantity,
        weight: editing.weight,
        allowDuplicateWithOtherPrizes: !!editing.allow_duplicate_with_other_prizes,
        allowDuplicateWithSamePrize: !!editing.allow_duplicate_with_same_prize,
        maxWinCount: editing.max_win_count,
      });
      setDisplayImage(editing.display_image);
    } else {
      setForm(DEFAULT_FORM);
      setDisplayImage(null);
    }
    setImageError(null);
    setError(null);
  }, [open, editing]);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") {
      setImageError("Only PNG files are supported at the moment — choose a different file.");
      e.target.value = "";
      return;
    }
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => setDisplayImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setDisplayImage(null);
  }

  async function handleSubmit() {
    setError(null);
    const trimmedName = form.name.trim();

    if (!displayImage) {
      setError("Prize image is required.");
      return;
    }
    if (!trimmedName) {
      setError("Prize name is required.");
      return;
    }
    if (form.quantity < 0) {
      setError("Quantity can't be negative.");
      return;
    }
    if (form.weight <= 0) {
      setError("Weight must be greater than 0.");
      return;
    }
    if (form.allowDuplicateWithSamePrize && form.maxWinCount < 1) {
      setError("Max win count must be at least 1.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        sessionId,
        name: trimmedName,
        category: form.category.trim() || undefined,
        // Không còn field "Status" riêng để tự tay ẩn/hiện nữa — quantity = 0 (nay cho phép nhập, xem
        // field Quantity bên dưới) đã đủ để loại giải khỏi lượt quay (drawEngine lọc theo
        // remaining > 0, remaining luôn khởi tạo = quantity), không cần thêm 1 cờ status độc lập nữa.
        // Luôn gửi "active" — giải nào lỡ có status "inactive" từ trước bản này (khi field còn tồn
        // tại) sẽ tự trở lại "active" ngay lần lưu tiếp theo qua form này.
        status: "active",
        quantity: form.quantity,
        weight: form.weight,
        allowDuplicateWithOtherPrizes: form.allowDuplicateWithOtherPrizes,
        allowDuplicateWithSamePrize: form.allowDuplicateWithSamePrize,
        maxWinCount: form.allowDuplicateWithSamePrize ? form.maxWinCount : 1,
        displayImage,
      };
      if (editing) {
        await window.api.prizes.update({ ...payload, id: editing.id });
        onSaved("Prize updated successfully.");
      } else {
        await window.api.prizes.create(payload);
        onSaved("Prize added successfully.");
      }
      onClose();
    } catch (e) {
      setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500";
  const labelClass = "mb-1 block text-xs text-base-400";

  return (
    <Modal open={open} title={editing ? "Edit Prize" : "Add Prize"} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">
            {error}
          </div>
        )}

        {/* Ảnh trình chiếu */}
        <div>
          <label className={labelClass}>Presentation image (PNG) *</label>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-700 bg-base-800">
              {displayImage ? (
                <img src={displayImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] text-base-500">None</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input type="file" accept="image/png" onChange={handleImageChange} className="text-xs text-base-300" />
              {displayImage && (
                <button onClick={removeImage} className="text-left text-xs text-danger-500 hover:underline">
                  Remove image
                </button>
              )}
              {imageError && <p className="text-xs text-danger-500">{imageError}</p>}
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Prize name *</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">— none —</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Quantity</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Weight (odds)</label>
            <input
              type="number"
              min={0.01}
              step={0.1}
              className={inputClass}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-base-800 bg-base-900 p-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-base-200">Allow duplicate with other prizes</span>
            <input
              type="checkbox"
              checked={form.allowDuplicateWithOtherPrizes}
              onChange={(e) => setForm({ ...form, allowDuplicateWithOtherPrizes: e.target.checked })}
              className="accent-gold-500"
            />
          </label>
          <p className="text-xs text-base-500">A winner of this prize can still win other prizes.</p>

          <label className="flex items-center justify-between text-sm">
            <span className="text-base-200">Allow duplicate with itself</span>
            <input
              type="checkbox"
              checked={form.allowDuplicateWithSamePrize}
              onChange={(e) => setForm({ ...form, allowDuplicateWithSamePrize: e.target.checked })}
              className="accent-gold-500"
            />
          </label>
          <p className="text-xs text-base-500">The same person can win this exact prize multiple times.</p>

          {form.allowDuplicateWithSamePrize && (
            <div>
              <label className={labelClass}>Max wins per person</label>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.maxWinCount}
                onChange={(e) => setForm({ ...form, maxWinCount: Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : editing ? "Update prize" : "Add prize"}
        </Button>
      </div>
    </Modal>
  );
}
