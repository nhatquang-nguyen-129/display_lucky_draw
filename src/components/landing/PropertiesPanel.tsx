import { AnchorEditTarget, BackgroundConfig, ButtonAction, LandingComponent, LandingConfig } from "@/lib/landing/types";
import { Participant, Prize } from "@/types";
import BackgroundPanel from "./panels/BackgroundPanel";
import SharedFields from "./panels/SharedFields";
import TextPanel from "./panels/TextPanel";
import ImagePanel from "./panels/ImagePanel";
import LuckyWheelPanel from "./panels/LuckyWheelPanel";
import LiveTextPanel from "./panels/LiveTextPanel";
import LiveImagePanel from "./panels/LiveImagePanel";
import CurrentTimePanel from "./panels/CurrentTimePanel";
import ParticipantCountPanel from "./panels/ParticipantCountPanel";
import ButtonPanel from "./panels/ButtonPanel";
import ScoreboardPanel from "./panels/ScoreboardPanel";

interface PropertiesPanelProps {
  config: LandingConfig;
  selected: LandingComponent | null;
  // Số component đang được chọn (0/1/nhiều — Ctrl/Cmd+click hoặc kéo-marquee trên LandingCanvas.tsx).
  // `selected` chỉ khác rỗng khi đúng bằng 1 — cần truyền riêng số này để phân biệt "0 chọn" (hiện
  // Background) với "nhiều hơn 1 chọn" (hiện bulk panel), 2 trạng thái mà `selected` một mình không
  // phân biệt được (cả 2 đều null).
  selectedCount: number;
  prizes: Prize[];
  participants: Participant[];
  onChangeBackground: (patch: Partial<BackgroundConfig>) => void;
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
  onChangeProps: (patch: Record<string, any>) => void;
  onDelete: () => void;
  // Đang sửa điểm neo Scale Up trực tiếp trên canvas hay không — xem doc-comment AnchorEditTarget
  // trong types.ts. Chỉ LiveImagePanel.tsx dùng tới.
  anchorEdit: AnchorEditTarget | null;
  onSetAnchorEdit: (target: AnchorEditTarget | null) => void;
}

// Container của Properties Panel — không có gì được chọn thì hiện form Background; chọn đúng 1 thì
// hiện SharedFields (x/y/w/h/effect + xoá) + form riêng của đúng loại component đó (switch theo
// type); chọn NHIỀU thì chỉ hiện tổng số + xoá hàng loạt, không có form nào giả định 1 component duy
// nhất (SharedFields và mọi panel riêng-theo-type bên dưới đều nhận thẳng `selected.props`, không
// hoạt động được với 1 mảng nhiều component khác type nhau).
export default function PropertiesPanel({
  config,
  selected,
  selectedCount,
  prizes,
  participants,
  onChangeBackground,
  onChangeComponent,
  onChangeProps,
  onDelete,
  anchorEdit,
  onSetAnchorEdit,
}: PropertiesPanelProps) {
  if (selectedCount > 1) {
    return (
      <div className="space-y-3 p-3">
        <p className="text-xs text-base-400">{selectedCount} components selected.</p>
        <button
          onClick={onDelete}
          className="w-full rounded border border-danger-500/30 bg-danger-500/10 px-2 py-1.5 text-xs text-danger-500 hover:bg-danger-500/20"
        >
          Delete {selectedCount} components
        </button>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="p-3">
        <BackgroundPanel background={config.canvas.background} onChange={onChangeBackground} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      {selected.type === "text" && <TextPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "image" && <ImagePanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "luckyWheel" && (
        <LuckyWheelPanel props={selected.props} participants={participants} onChange={onChangeProps} />
      )}
      {(selected.type === "winnerName" || selected.type === "prizeName") && (
        <LiveTextPanel
          props={selected.props}
          onChange={onChangeProps}
          showWinnerFields={selected.type === "winnerName"}
        />
      )}
      {selected.type === "prizeImage" && (
        <LiveImagePanel
          props={selected.props}
          prizes={prizes}
          onChange={onChangeProps}
          componentId={selected.id}
          anchorEdit={anchorEdit}
          onSetAnchorEdit={onSetAnchorEdit}
        />
      )}
      {selected.type === "currentTime" && <CurrentTimePanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "participantCount" && (
        <ParticipantCountPanel props={selected.props} onChange={onChangeProps} />
      )}
      {selected.type === "button" && (
        <ButtonPanel
          props={selected.props}
          participants={participants}
          // Action nào (trừ "none") đã bị 1 Button KHÁC trên trang chiếm — tối đa 1 Button/action,
          // tránh 2 nút cùng "Draw" gây nhầm lẫn vận hành. Key = action, value = tên Button đang giữ.
          usedActionOwners={Object.fromEntries(
            config.components
              .filter(
                (c): c is Extract<LandingComponent, { type: "button" }> =>
                  c.type === "button" && c.id !== selected.id && c.props.action !== "none"
              )
              .map((c) => [c.props.action, c.name?.trim() || "Button"])
          ) as Partial<Record<ButtonAction, string>>}
          onChange={onChangeProps}
        />
      )}
      {selected.type === "scoreboard" && (
        <ScoreboardPanel props={selected.props} participants={participants} onChange={onChangeProps} />
      )}
      <div className="h-px bg-base-800" />
      <SharedFields component={selected} onChange={onChangeComponent} onDelete={onDelete} />
    </div>
  );
}
