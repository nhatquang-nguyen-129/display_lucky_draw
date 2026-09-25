import { AnchorEditTarget, ButtonAction, LandingComponent, LandingConfig } from "@/lib/landing/types";
import { Participant, Prize } from "@/types";
import BackgroundPanel from "./panels/BackgroundPanel";
import SharedFields from "./panels/SharedFields";
import { DrawCyclePrizesContext } from "./panels/DrawCycleFields";
import TextPanel from "./panels/TextPanel";
import ImagePanel from "./panels/ImagePanel";
import LuckyWheelPanel from "./panels/LuckyWheelPanel";
import LiveTextPanel from "./panels/LiveTextPanel";
import LiveImagePanel from "./panels/LiveImagePanel";
import CurrentTimePanel from "./panels/CurrentTimePanel";
import ParticipantCountPanel from "./panels/ParticipantCountPanel";
import ButtonPanel from "./panels/ButtonPanel";
import ScoreboardPanel from "./panels/ScoreboardPanel";
import OrbitLightsPanel from "./panels/OrbitLightsPanel";
import FireworksPanel from "./panels/FireworksPanel";
import ConfettiPanel from "./panels/ConfettiPanel";
import MarqueeLightsPanel from "./panels/MarqueeLightsPanel";
import SparkFountainPanel from "./panels/SparkFountainPanel";

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
  // JSON session.participant_column_types — LiveTextPanel.tsx (Winner Name) dùng để liệt kê mọi cột
  // đang gán Data Type = Name cho dropdown "Source" (xem WinnerNameProps.nameSourceColumn);
  // LuckyWheelPanel.tsx dùng để biết field "Name/Phone/Email/Code" chung đang resolve ra cột nào
  // (xem resolveWheelField trong lib/landing/types.ts); ButtonPanel.tsx dùng để liệt kê cột đang gán
  // Data Type = URL cho dropdown "Source" của action "Open Link".
  columnTypesJson: string | null;
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
  onChangeProps: (patch: Record<string, any>) => void;
  onDelete: () => void;
  // Đang sửa điểm neo Scale Up trực tiếp trên canvas hay không — xem doc-comment AnchorEditTarget
  // trong types.ts. Chỉ LiveImagePanel.tsx dùng tới.
  anchorEdit: AnchorEditTarget | null;
  onSetAnchorEdit: (target: AnchorEditTarget | null) => void;
}

// Container của Properties Panel — không có gì được chọn thì hiện gợi ý chọn/thêm component (Background
// giờ là 1 component bình thường như Image, không còn panel riêng lúc chưa chọn gì); chọn đúng 1 thì
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
  columnTypesJson,
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
        <p className="text-xs text-base-400">Select a component to edit its properties, or add one from the palette.</p>
      </div>
    );
  }

  return (
    <DrawCyclePrizesContext.Provider value={prizes}>
      <div className="space-y-4 p-3">
        {selected.type === "text" && <TextPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "image" && <ImagePanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "background" && <BackgroundPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "luckyWheel" && (
          <LuckyWheelPanel
            props={selected.props}
            participants={participants}
            columnTypesJson={columnTypesJson}
            x={selected.x}
            y={selected.y}
            width={selected.width}
            height={selected.height}
            onChangeComponent={onChangeComponent}
            onChange={onChangeProps}
          />
        )}
        {selected.type === "winnerName" && (
          <LiveTextPanel
            props={selected.props}
            x={selected.x}
            y={selected.y}
            width={selected.width}
            height={selected.height}
            onChangeComponent={onChangeComponent}
            participants={participants}
            columnTypesJson={columnTypesJson}
            onChange={onChangeProps}
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
            columnTypesJson={columnTypesJson}
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
        {selected.type === "orbitLights" && <OrbitLightsPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "fireworks" && <FireworksPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "confetti" && <ConfettiPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "marqueeLights" && <MarqueeLightsPanel props={selected.props} onChange={onChangeProps} />}
        {selected.type === "sparkFountain" && <SparkFountainPanel props={selected.props} onChange={onChangeProps} />}
        <div className="h-px bg-base-800" />
        <SharedFields
          component={selected}
          onChange={onChangeComponent}
          onDelete={onDelete}
          hidePosition={selected.type === "winnerName" || selected.type === "luckyWheel"}
          hideEffect={selected.type === "winnerName" || selected.type === "luckyWheel"}
        />
      </div>
    </DrawCyclePrizesContext.Provider>
  );
}
