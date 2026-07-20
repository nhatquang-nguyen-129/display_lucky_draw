import { useEffect, useState } from "react";
import { CountdownComponent } from "@/lib/landing/types";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function CountdownView({ component }: { component: CountdownComponent }) {
  const { targetIsoTime, fontSize, color, align, completedText } = component.props;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const target = targetIsoTime ? new Date(targetIsoTime).getTime() : null;
  const remaining = target !== null ? target - now : null;
  const text = target === null ? "No target time set" : remaining! > 0 ? formatRemaining(remaining!) : completedText;

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden font-mono"
      style={{
        fontSize,
        color,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {text}
    </div>
  );
}
