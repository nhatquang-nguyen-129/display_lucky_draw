import { ImageComponent } from "@/lib/landing/types";

export default function ImageView({ component }: { component: ImageComponent }) {
  const { srcDataUrl, fit, borderRadius } = component.props;
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden bg-base-800/40"
      style={{ borderRadius }}
    >
      {srcDataUrl ? (
        <img
          src={srcDataUrl}
          alt=""
          className="h-full w-full"
          style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }}
        />
      ) : (
        <span className="text-xs text-base-500">No image</span>
      )}
    </div>
  );
}
