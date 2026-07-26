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

interface PropertiesPanelProps {
  config: LandingConfig;
  selected: LandingComponent | null;
  sessionName: string;
  prizes: Prize[];
  participants: Participant[];
  urlFields: string[];
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
  urlFields,
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
        <ButtonPanel props={selected.props} urlFields={urlFields} onChange={onChangeProps} />
      )}
      <div className="h-px bg-base-800" />
      <SharedFields component={selected} onChange={onChangeComponent} onDelete={onDelete} />
    </div>
  );
}
