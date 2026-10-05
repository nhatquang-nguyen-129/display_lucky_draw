import { useEffect, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, LandingComponent, OutputFrameComponent, OutputFrameProps } from "@/lib/landing/types";

interface OutputFramePanelProps {
  component: OutputFrameComponent;
  onChange: (patch: Partial<OutputFrameProps>) => void;
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Panel của Output Frame — nhập độ phân giải màn LED (chỉ lấy tỉ lệ), height khung tự khớp theo width
// (fitAutoHeight trong LandingBuilderWindow.tsx). "Fit to canvas" = khung lớn nhất vừa canvas, canh giữa.
export default function OutputFramePanel({ component, onChange, onChangeComponent }: OutputFramePanelProps) {
  const { props } = component;
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
    const ratio = props.targetWidth / props.targetHeight;
    let width = Math.min(props.targetWidth, CANVAS_WIDTH);
    if (width / ratio > CANVAS_HEIGHT) width = CANVAS_HEIGHT * ratio;
    width = Math.round(width);
    const height = Math.round(width / ratio);
    onChangeComponent({
      width,
      height,
      x: Math.round((CANVAS_WIDTH - width) / 2),
      y: Math.round((CANVAS_HEIGHT - height) / 2),
    });
  }

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      {/* Toggle hiện/ẩn khung ở cửa sổ trình chiếu — Builder luôn hiện. Đổi xong phải Save, Present Mode
          tự cập nhật sau ≤2s (poll config). */}
      <div className="space-y-1 rounded border border-base-700 bg-base-800 px-2 py-1.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-base-200">
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
