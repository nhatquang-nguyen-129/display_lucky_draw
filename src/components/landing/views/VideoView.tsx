import { useEffect, useRef } from "react";
import { DEFAULT_VIDEO_CYCLE, drawCycleResultId, LandingData, VideoComponent, VideoPlayState } from "@/lib/landing/types";
import { mediaUrl, useLandingSessionId } from "../LandingSessionContext";
import { useVideoCycleState } from "./drawRevealHooks";

// Video — cùng khuôn ImageView.tsx (Fit/Border radius, "Interactions with Draw" bật/tắt được), chỉ khác
// Appearance là trạng thái PHÁT (Play/Pause/Stop, xem VideoCycleConfig trong types.ts) thay vì hiện/ẩn.
// Video không bao giờ bị ẩn — Stop vẫn hiện khung hình đầu tiên.
export default function VideoView({
  component,
  data,
  builderPreview,
  resetSeq,
}: {
  component: VideoComponent;
  // 3 prop dưới CHỈ có tác dụng khi `props.syncWithDraw` bật — giống ImageView.tsx.
  data?: LandingData;
  builderPreview?: boolean;
  resetSeq?: number;
}) {
  const { mediaId, fit, borderRadius, loop, muted, syncWithDraw, drawCycle } = component.props;
  const sessionId = useLandingSessionId();
  const src = sessionId && mediaId ? mediaUrl(sessionId, mediaId) : null;
  const videoRef = useRef<HTMLVideoElement>(null);

  const liveResultId = drawCycleResultId(data?.results[0], drawCycle);
  const { playState, seq } = useVideoCycleState(liveResultId, drawCycle ?? DEFAULT_VIDEO_CYCLE, resetSeq);

  // Builder canvas LUÔN đứng yên ở khung hình đầu — video chạy liên tục trong lúc kéo-thả chỉ gây rối và
  // tốn CPU. Không bật syncWithDraw thì tự phát ngay (theo `loop`).
  const desired: VideoPlayState = builderPreview ? "stop" : syncWithDraw ? playState : "play";

  // `seq` trong deps: cùng 1 trạng thái chạy lại vẫn phải áp lại (vd Redraw = Stop khi đang Stop sẵn —
  // xem useVideoCycleState).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (desired === "play") {
      // play() bị từ chối (vd file hỏng/codec không hỗ trợ) không được làm vỡ trang trình chiếu.
      video.play().catch(() => {});
    } else {
      video.pause();
      if (desired === "stop") video.currentTime = 0;
    }
  }, [desired, seq, src]);

  // React không cập nhật đáng tin thuộc tính `muted` của <video> khi prop đổi — gán thẳng qua ref.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, src]);

  return (
    <div
      // Nền mờ CHỈ hiện khi chưa có video (placeholder) — giống ImageView.tsx.
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${!src ? "bg-base-800/40" : ""}`}
      style={{ borderRadius }}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          muted={muted}
          loop={loop}
          playsInline
          preload="auto"
          className="pointer-events-none h-full w-full"
          style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }}
        />
      ) : (
        <span className="text-xs text-base-500">No video</span>
      )}
    </div>
  );
}
