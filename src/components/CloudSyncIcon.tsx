import { useId } from "react";

// Biểu tượng "đang đồng bộ lên cloud": đám mây nhỏ + mũi tên chỉ lên, mũi tên chạy lên liên tục
// (`cloud-arrow-up`, index.css — tắt khi hệ điều hành bật "giảm chuyển động"). Dùng cho trạng thái
// "syncing" của session (chấm trên tab, danh sách Open) — xem electron/cloudSync.ts.
export default function CloudSyncIcon({ className = "h-3.5 w-3.5", title }: { className?: string; title?: string }) {
  const clipId = `cloud-sync-clip-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {title && <title>{title}</title>}
      {/* Đám mây */}
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" />
      {/* Mũi tên chỉ lên — clip trong vùng đám mây để lúc chạy lên không tràn ra ngoài icon */}
      <clipPath id={clipId}>
        <rect x="6" y="9" width="12" height="13" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g className="cloud-arrow-up">
          <path d="M12 20v-7" />
          <path d="M9.25 15.5 12 12.75l2.75 2.75" />
        </g>
      </g>
    </svg>
  );
}
