import { useEffect, useState } from "react";

// Popup "mất kết nối" — dùng ở cửa sổ chính (Layout.tsx), Landing Builder và Data Editor. KHÔNG dùng ở
// Present (đang chiếu lên LED — main.ts cũng không gửi sự kiện tới cửa sổ đó). Tự đóng khi có mạng lại;
// "Hide" chỉ ẩn tạm tới lần mất mạng kế tiếp. Không đăng xuất, không chặn quay số (xem electron/auth.ts).
export default function ReconnectPopup() {
  const [offline, setOffline] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(
    () =>
      window.api.auth.onConnectivityChange((isOffline) => {
        setOffline(isOffline);
        if (isOffline) setHidden(false);
      }),
    []
  );

  if (!offline || hidden) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-base-800 bg-base-900 p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-highlight-500 border-t-transparent" />
          <h2 className="font-display text-base font-medium text-base-100">Connection lost — reconnecting...</h2>
        </div>
        <p className="mt-2 text-xs text-base-400">
          The draw keeps running. Changes are kept on this computer and will sync to the cloud automatically once the
          connection is back.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setHidden(true)}
            className="rounded-md border border-base-700 px-3 py-1.5 text-xs text-base-300 hover:bg-base-800"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}
