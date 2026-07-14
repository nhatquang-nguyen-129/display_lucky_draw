import { ChangeEvent, useEffect, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Prize } from "@/types";

interface PrizeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  sessionId: string;
  existingCodes: string[]; // mã giải đã có trong phiên hiện tại (để chặn trùng), không tính chính giải đang sửa
  editing: Prize | null; // null = thêm mới, có giá trị = đang sửa giải này
}

const CATEGORY_SUGGESTIONS = ["Đặc biệt", "Giải Nhất", "Giải Nhì", "Giải Ba", "Khuyến khích"];

const DEFAULT_FORM = {
  code: "",
  name: "",
  category: "",
  status: "active",
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
  existingCodes,
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
        code: editing.code ?? "",
        name: editing.name,
        category: editing.category ?? "",
        status: editing.status,
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
      setImageError("Chỉ hỗ trợ file PNG ở thời điểm hiện tại — chọn file khác.");
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
    const trimmedCode = form.code.trim();

    if (!trimmedName) {
      setError("Tên giải là bắt buộc.");
      return;
    }
    if (trimmedCode && existingCodes.includes(trimmedCode)) {
      setError(`Mã "${trimmedCode}" đã được dùng cho giải khác trong phiên này — đổi mã khác.`);
      return;
    }
    if (form.quantity < 1) {
      setError("Số lượng phải từ 1 trở lên.");
      return;
    }
    if (form.weight <= 0) {
      setError("Trọng số phải lớn hơn 0.");
      return;
    }
    if (form.allowDuplicateWithSamePrize && form.maxWinCount < 1) {
      setError("Số lần trúng tối đa phải từ 1 trở lên.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        sessionId,
        code: trimmedCode || undefined,
        name: trimmedName,
        category: form.category.trim() || undefined,
        status: form.status,
        quantity: form.quantity,
        weight: form.weight,
        allowDuplicateWithOtherPrizes: form.allowDuplicateWithOtherPrizes,
        allowDuplicateWithSamePrize: form.allowDuplicateWithSamePrize,
        maxWinCount: form.allowDuplicateWithSamePrize ? form.maxWinCount : 1,
        displayImage,
      };
      if (editing) {
        await window.api.prizes.update({ ...payload, id: editing.id });
        onSaved("Đã cập nhật giải thưởng thành công.");
      } else {
        await window.api.prizes.create(payload);
        onSaved("Đã nhập thông tin giải thưởng thành công.");
      }
      onClose();
    } catch (e) {
      setError("Lưu thất bại — thử lại.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500";
  const labelClass = "mb-1 block text-xs text-base-400";

  return (
    <Modal open={open} title={editing ? "Sửa giải thưởng" : "Thêm giải thưởng"} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">
            {error}
          </div>
        )}

        {/* Ảnh trình chiếu */}
        <div>
          <label className={labelClass}>Hình ảnh trình chiếu (PNG)</label>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-700 bg-base-800">
              {displayImage ? (
                <img src={displayImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] text-base-500">Chưa có</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input type="file" accept="image/png" onChange={handleImageChange} className="text-xs text-base-300" />
              {displayImage && (
                <button onClick={removeImage} className="text-left text-xs text-danger-500 hover:underline">
                  Xoá ảnh
                </button>
              )}
              {imageError && <p className="text-xs text-danger-500">{imageError}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Mã giải</label>
            <input
              className={inputClass}
              placeholder="VD: G01"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Trạng thái</label>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Đang áp dụng</option>
              <option value="inactive">Tạm ẩn (không đưa vào vòng quay)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Tên giải *</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Danh mục</label>
          <input
            list="prize-category-suggestions"
            className={inputClass}
            placeholder="VD: Giải Nhất"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <datalist id="prize-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Số lượng</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Trọng số (tỷ lệ)</label>
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
            <span className="text-base-200">Cho phép trùng với giải khác</span>
            <input
              type="checkbox"
              checked={form.allowDuplicateWithOtherPrizes}
              onChange={(e) => setForm({ ...form, allowDuplicateWithOtherPrizes: e.target.checked })}
              className="accent-gold-500"
            />
          </label>
          <p className="text-xs text-base-500">1 người trúng giải này rồi vẫn có thể trúng thêm giải khác.</p>

          <label className="flex items-center justify-between text-sm">
            <span className="text-base-200">Cho phép trùng với chính giải này</span>
            <input
              type="checkbox"
              checked={form.allowDuplicateWithSamePrize}
              onChange={(e) => setForm({ ...form, allowDuplicateWithSamePrize: e.target.checked })}
              className="accent-gold-500"
            />
          </label>
          <p className="text-xs text-base-500">1 người có thể trúng lại đúng giải này nhiều lần.</p>

          {form.allowDuplicateWithSamePrize && (
            <div>
              <label className={labelClass}>Số lần trúng tối đa / người</label>
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
          {saving ? "Đang lưu..." : editing ? "Cập nhật giải thưởng" : "Thêm giải thưởng"}
        </Button>
      </div>
    </Modal>
  );
}
