import { BackgroundConfig, LandingComponent, LandingConfig } from "@/lib/landing/types";
import { Participant, Prize } from "@/types";
import BackgroundPanel from "./panels/BackgroundPanel";
import SharedFields from "./panels/SharedFields";
import TextPanel from "./panels/TextPanel";
import ImagePanel from "./panels/ImagePanel";
import LuckyWheelPanel from "./panels/LuckyWheelPanel";
import LiveTextPanel from "./panels/LiveTextPanel";
import LiveImagePanel from "./panels/LiveImagePanel";
import PrizeListPanel from "./panels/PrizeListPanel";
import CountdownPanel from "./panels/CountdownPanel";
import CurrentTimePanel from "./panels/CurrentTimePanel";
import ParticipantCountPanel from "./panels/ParticipantCountPanel";
import ButtonPanel from "./panels/ButtonPanel";
import ScoreboardPanel from "./panels/ScoreboardPanel";
import FireworksPanel from "./panels/FireworksPanel";
import StageLightPanel from "./panels/StageLightPanel";
import DimBackgroundPanel from "./panels/DimBackgroundPanel";
import LinkOpenerPanel from "./panels/LinkOpenerPanel";
import DrawPanel from "./panels/DrawPanel";
import ConfirmWinnerPanel from "./panels/ConfirmWinnerPanel";

interface PropertiesPanelProps {
  config: LandingConfig;
  selected: LandingComponent | null;
  sessionName: string;
  prizes: Prize[];
  participants: Participant[];
  onChangeBackground: (patch: Partial<BackgroundConfig>) => void;
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
  onChangeProps: (patch: Record<string, any>) => void;
  onDelete: () => void;
}

// Container của Properties Panel — không có gì được chọn thì hiện form Background; có chọn thì
// hiện SharedFields (x/y/w/h/effect + xoá) + form riêng của đúng loại component đó (switch theo type).
export default function PropertiesPanel({
  config,
  selected,
  sessionName,
  prizes,
  participants,
  onChangeBackground,
  onChangeComponent,
  onChangeProps,
  onDelete,
}: PropertiesPanelProps) {
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
        <LuckyWheelPanel
          props={selected.props}
          sessionName={sessionName}
          participants={participants}
          onChange={onChangeProps}
        />
      )}
      {(selected.type === "winnerName" || selected.type === "prizeName") && (
        <LiveTextPanel props={selected.props} onChange={onChangeProps} />
      )}
      {selected.type === "prizeImage" && (
        <LiveImagePanel props={selected.props} prizes={prizes} onChange={onChangeProps} />
      )}
      {selected.type === "prizeList" && <PrizeListPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "countdown" && <CountdownPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "currentTime" && <CurrentTimePanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "participantCount" && (
        <ParticipantCountPanel props={selected.props} onChange={onChangeProps} />
      )}
      {selected.type === "button" && (
        <ButtonPanel
          component={selected}
          // Tên các Button KHÁC trên trang (không tính chính nút này) — Button không có action nào
          // phân biệt nữa nên tên phải duy nhất để nhận diện đúng trên Trigger Graph.
          usedNames={config.components
            .filter((c): c is Extract<LandingComponent, { type: "button" }> => c.type === "button" && c.id !== selected.id)
            .map((c) => c.name?.trim() ?? "")
            .filter(Boolean)}
          onChangeComponent={onChangeComponent}
          onChange={onChangeProps}
        />
      )}
      {selected.type === "scoreboard" && <ScoreboardPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "fireworks" && <FireworksPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "stageLight" && <StageLightPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "dimBackground" && <DimBackgroundPanel props={selected.props} onChange={onChangeProps} />}
      {selected.type === "linkOpener" && (
        <LinkOpenerPanel props={selected.props} participants={participants} onChange={onChangeProps} />
      )}
      {selected.type === "draw" && <DrawPanel />}
      {selected.type === "confirmWinner" && <ConfirmWinnerPanel />}
      <div className="h-px bg-base-800" />
      <SharedFields component={selected} onChange={onChangeComponent} onDelete={onDelete} />
    </div>
  );
}
