import { ReactNode } from "react";
import appIcon from "@/assets/app-icon-256.png";

// Khung chung cho các màn TRƯỚC khi vào app (kích hoạt, đăng nhập, quên mật khẩu, không có mạng): nền
// sáng với vài đốm màu thương hiệu mờ trôi rất chậm (`auth-blob`, index.css — tắt khi hệ điều hành bật
// "giảm chuyển động"), card trắng ở giữa có logo app. Chỉ CSS, không thêm thư viện.
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-900 px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="auth-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold-500/20 blur-3xl" />
        <div
          className="auth-blob absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-teal-500/25 blur-3xl"
          style={{ animationDelay: "-8s" }}
        />
        <div
          className="auth-blob absolute right-1/4 top-10 h-64 w-64 rounded-full bg-highlight-500/20 blur-3xl"
          style={{ animationDelay: "-15s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-base-800 bg-base-950/90 p-8 shadow-xl shadow-gold-500/10 backdrop-blur">
        <div className="mb-5 flex justify-center">
          <img src={appIcon} alt="Lucky Draw Studio" className="h-16 w-16 rounded-2xl shadow-lg shadow-gold-500/25" draggable={false} />
        </div>
        {children}
      </div>
    </div>
  );
}
