import { useEffect, useState } from "react";
import { CurrentTimeComponent } from "@/lib/landing/types";

export default function CurrentTimeView({ component }: { component: CurrentTimeComponent }) {
  const { fontSize, color, align, format } = component.props;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const text = now.toLocaleTimeString(undefined, { hour12: format === "12h" });

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
