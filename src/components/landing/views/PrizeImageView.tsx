import { LandingData, PrizeImageComponent } from "@/lib/landing/types";

export default function PrizeImageView({ component, data }: { component: PrizeImageComponent; data?: LandingData }) {
  const { fit, borderRadius, fallbackImageDataUrl } = component.props;
  const latest = data?.results[0];
  const src = latest?.prize_display_image ?? fallbackImageDataUrl;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-base-800/40" style={{ borderRadius }}>
      {src ? (
        <img src={src} alt="" className="h-full w-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }} />
      ) : (
        <span className="text-xs text-base-500">No image</span>
      )}
    </div>
  );
}
