import { useEffect, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_FRAME_DIM_OPACITY,
  FrameMaskDetect,
  LandingComponent,
  OutputFrameComponent,
  OutputFrameProps,
  resolveFrameMaskOptions,
} from "@/lib/landing/types";
import { loadImage, useFrameMask } from "@/lib/landing/frameMask";

interface OutputFramePanelProps {
  component: OutputFrameComponent;
  onChange: (patch: Partial<OutputFrameProps>) => void;
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const checkboxRowClass = "flex cursor-pointer items-center gap-1.5 text-xs text-base-200";

// Khung lớn nhất có tỉ lệ ratio vừa canvas, canh giữa.
function fitRect(targetWidth: number, targetHeight: number) {
  const ratio = targetWidth / targetHeight;
  let width = Math.min(targetWidth, CANVAS_WIDTH);
  if (width / ratio > CANVAS_HEIGHT) width = CANVAS_HEIGHT * ratio;
  width = Math.round(width);
  const height = Math.round(width / ratio);
  return { width, height, x: Math.round((CANVAS_WIDTH - width) / 2), y: Math.round((CANVAS_HEIGHT - height) / 2) };
}

// Panel của Output Frame — nhập độ phân giải màn LED (chỉ lấy tỉ lệ), height khung tự khớp theo width
// (fitAutoHeight trong LandingBuilderWindow.tsx). "Fit to canvas" = khung lớn nhất vừa canvas, canh giữa.
// Shape "Image": import file pixel map PNG bên LED gửi — độ phân giải LED lấy luôn từ kích thước ảnh
// (không gõ tay, không thể sai tỉ lệ), vùng LED nhận diện ở frameMask.ts.
export default function OutputFramePanel({ component, onChange, onChangeComponent }: OutputFramePanelProps) {
  const { props } = component;
  const shape = props.shape ?? "rect";
  const maskOptions = resolveFrameMaskOptions(props);
  const mask = useFrameMask(shape === "image" ? props.maskSrc : null, maskOptions);
  const [importError, setImportError] = useState<string | null>(null);
  // Gõ dở (rỗng/0) không được ghi vào props — tỉ lệ chia cho 0. Chỉ ghi khi là số dương.
  const [w, setW] = useState(String(props.targetWidth));
  const [h, setH] = useState(String(props.targetHeight));
  useEffect(() => setW(String(props.targetWidth)), [props.targetWidth]);
  useEffect(() => setH(String(props.targetHeight)), [props.targetHeight]);

  function commitSize(nextW: string, nextH: string) {
    const tw = Math.round(Number(nextW));
    const th = Math.round(Number(nextH));
    if (tw > 0 && th > 0) onChange({ targetWidth: tw, targetHeight: th });
  }

  function fitToCanvas() {
    onChangeComponent(fitRect(props.targetWidth, props.targetHeight));
  }

  // Import xong: lấy độ phân giải LED = kích thước ảnh, rồi tự Fit to canvas (tỉ lệ vừa đổi, khung cũ
  // có thể tràn canvas). Ảnh lưu nguyên gốc dạng data URL trong landing_config như Image/Background.
  function handleFile(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const src = reader.result as string;
      try {
        const img = await loadImage(src);
        onChange({
          shape: "image",
          maskSrc: src,
          maskFileName: file.name,
          targetWidth: img.naturalWidth,
          targetHeight: img.naturalHeight,
        });
        onChangeComponent(fitRect(img.naturalWidth, img.naturalHeight));
      } catch {
        setImportError("Cannot read this image — use a PNG or JPG file.");
      }
    };
    reader.readAsDataURL(file);
  }

  const coverage = mask.result?.coverage ?? null;
  const coverageWarning =
    coverage === null
      ? null
      : coverage < 0.01
        ? "Almost no LED area detected — try another Detect mode or Invert."
        : coverage > 0.99
          ? "The whole image is detected as LED — try another Detect mode or Invert."
          : null;

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      {/* Toggle hiện/ẩn khung ở cửa sổ trình chiếu — Builder luôn hiện. Đổi xong phải Save, Present Mode
          tự cập nhật sau ≤2s (poll config). */}
      <div className="space-y-1 rounded border border-base-700 bg-base-800 px-2 py-1.5">
        <label className={checkboxRowClass}>
          <input
            type="checkbox"
            checked={props.showInPresent}
            onChange={(e) => onChange({ showInPresent: e.target.checked })}
            className="accent-gold-500"
          />
          Show in Presentation
        </label>
        <p className="text-[10px] text-base-500">
          {props.showInPresent
            ? "Visible on the presentation window — turn off and Save before the show."
            : "Hidden on the presentation window (always visible in the Builder)."}
        </p>
      </div>

      <div>
        <label className={labelClass}>Shape</label>
        <select
          className={fieldClass}
          value={shape}
          onChange={(e) => {
            const next = e.target.value as "rect" | "image";
            onChange({ shape: next });
            // Quay lại Image đã có ảnh từ trước: tỉ lệ khung theo đúng ảnh đó.
            if (next === "image" && props.maskSrc && mask.result) {
              commitSize(String(mask.result.naturalWidth), String(mask.result.naturalHeight));
            }
          }}
        >
          <option value="rect">Rectangle</option>
          <option value="image">Image (LED mapping PNG)</option>
        </select>
      </div>

      {shape === "rect" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>LED width</label>
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={w}
              onChange={(e) => {
                setW(e.target.value);
                commitSize(e.target.value, h);
              }}
            />
          </div>
          <div>
            <label className={labelClass}>LED height</label>
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={h}
              onChange={(e) => {
                setH(e.target.value);
                commitSize(w, e.target.value);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Mapping image (PNG, JPG)</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="text-xs text-base-300"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = ""; // chọn lại đúng file cũ vẫn import lại được
              }}
            />
            {props.maskSrc && (
              <p className="mt-1 truncate text-[10px] text-base-500">
                {props.maskFileName ?? "Mapping image"} · LED {props.targetWidth}×{props.targetHeight} (from the
                image)
              </p>
            )}
            {(importError || mask.error) && <p className="mt-1 text-[10px] text-danger-500">{importError ?? mask.error}</p>}
          </div>

          {props.maskSrc && (
            <>
              <div>
                <label className={labelClass}>Detect LED area by</label>
                <select
                  className={fieldClass}
                  value={maskOptions.detect}
                  onChange={(e) => onChange({ maskDetect: e.target.value as FrameMaskDetect })}
                >
                  <option value="auto">
                    Auto{mask.result && maskOptions.detect === "auto" ? ` (${mask.result.detectedBy === "alpha" ? "transparency" : "brightness"})` : ""}
                  </option>
                  <option value="alpha">Transparency — transparent = outside</option>
                  <option value="luminance">Brightness — black = outside</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={checkboxRowClass}>
                  <input
                    type="checkbox"
                    checked={maskOptions.invert}
                    onChange={(e) => onChange({ maskInvert: e.target.checked })}
                    className="accent-gold-500"
                  />
                  Invert (LED area is dark/transparent)
                </label>
                <label className={checkboxRowClass}>
                  <input
                    type="checkbox"
                    checked={maskOptions.fillHoles}
                    onChange={(e) => onChange({ maskFillHoles: e.target.checked })}
                    className="accent-gold-500"
                  />
                  Fill enclosed holes (panel labels) — turn off for ring screens
                </label>
              </div>
              <div>
                <label className={labelClass}>Close gaps between panels ({maskOptions.gapFill}px)</label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  className="w-full accent-gold-500"
                  value={maskOptions.gapFill}
                  onChange={(e) => onChange({ maskGapFill: Number(e.target.value) })}
                />
              </div>
              <div className="rounded bg-base-800 px-2 py-1.5 text-xs text-base-300">
                {mask.busy && !mask.result
                  ? "Detecting LED area…"
                  : coverage !== null && `LED area: ${(coverage * 100).toFixed(1)}% of the image`}
                {coverageWarning && <p className="mt-1 text-[10px] text-danger-500">{coverageWarning}</p>}
              </div>
              <div className="space-y-1.5 rounded border border-base-700 bg-base-800 px-2 py-1.5">
                <label className={checkboxRowClass}>
                  <input
                    type="checkbox"
                    checked={props.dimOutside ?? false}
                    onChange={(e) => onChange({ dimOutside: e.target.checked })}
                    className="accent-gold-500"
                  />
                  Dim outside LED area
                </label>
                {props.dimOutside && (
                  <div>
                    <label className={labelClass}>Dim amount ({props.dimOpacity ?? DEFAULT_FRAME_DIM_OPACITY}%)</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      className="w-full accent-gold-500"
                      value={props.dimOpacity ?? DEFAULT_FRAME_DIM_OPACITY}
                      onChange={(e) => onChange({ dimOpacity: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Show mapping image in Builder ({props.maskImageOpacity ?? 0}%)</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  className="w-full accent-gold-500"
                  value={props.maskImageOpacity ?? 0}
                  onChange={(e) => onChange({ maskImageOpacity: Number(e.target.value) })}
                />
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={fitToCanvas}
        className="w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-200 hover:bg-base-700"
      >
        Fit to canvas
      </button>
      <div className="rounded bg-base-800 px-2 py-1.5 text-xs text-base-300">
        Crop on canvas: X {Math.round(component.x)}, Y {Math.round(component.y)}, {Math.round(component.width)}×
        {Math.round(component.height)}
      </div>
    </div>
  );
}
