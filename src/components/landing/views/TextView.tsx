import { TextComponent } from "@/lib/landing/types";

export default function TextView({ component }: { component: TextComponent }) {
  const { content, fontSize, color, fontWeight, align } = component.props;
  return (
    <div
      className="flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{ fontSize, color, fontWeight, textAlign: align, justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}
    >
      {content}
    </div>
  );
}
