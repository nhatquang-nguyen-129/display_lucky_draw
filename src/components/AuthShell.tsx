import { ReactNode } from "react";
import appIcon from "@/assets/app-icon-256.png";

// Vài đốm màu thương hiệu mờ phía sau các màn trước khi vào app — tắt khi hệ điều hành bật "giảm
// chuyển động" (index.css). `variant="welcome"`: màn Welcome sau khi tạo admin xong — trôi CHẬM nhưng
// RÕ (vị trí + scale + opacity cùng đổi), mỗi đốm 1 chu kỳ riêng (không đồng bộ, cảm giác trôi tự do
// trong không gian) — khác nhịp rất chậm, gần như đứng yên (`auth-blob`) ở các màn tĩnh nhìn lâu
// (Activate/Sign in/...), nhưng KHÔNG nhanh/giật như bản thử trước (dễ gây xao nhãng, che mất chữ).
export function AuthBackground({ variant = "default" }: { variant?: "default" | "welcome" }) {
  const isWelcome = variant === "welcome";
  const blob = isWelcome ? "welcome-blob" : "auth-blob";
  // Màn Welcome tăng hẳn độ đậm màu (không chỉ chuyển động) để "nhận ra ngay" lúc chuyển cảnh — màn
  // tĩnh (Activate/Sign in) giữ mờ nhẹ như cũ vì nhìn lâu, đậm quá sẽ chói mắt.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Blue/violet — trên-trái */}
      <div
        className={`${blob} absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl ${isWelcome ? "bg-gold-500/60" : "bg-gold-500/20"}`}
        style={isWelcome ? { animationDuration: "11s" } : undefined}
      />
      {/* Blue/cyan — dưới-phải */}
      <div
        className={`${blob} absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full blur-3xl ${isWelcome ? "bg-teal-500/65" : "bg-teal-500/25"}`}
        style={isWelcome ? { animationDuration: "14s", animationDelay: "-4s" } : { animationDelay: "-8s" }}
      />
      {/* Warm yellow/orange — trên, lệch phải */}
      <div
        className={`${blob} absolute right-1/4 top-10 h-64 w-64 rounded-full blur-3xl ${isWelcome ? "bg-highlight-500/60" : "bg-highlight-500/20"}`}
        style={isWelcome ? { animationDuration: "9s", animationDelay: "-2s" } : { animationDelay: "-15s" }}
      />
    </div>
  );
}

// Khung chung cho các màn TRƯỚC khi vào app (kích hoạt, đăng nhập, quên mật khẩu, không có mạng): nền
// sáng với đốm màu trôi chậm phía sau, logo app ở trên cùng. Màn Welcome (Login.tsx) KHÔNG dùng khung
// này — tự dựng nền riêng qua `AuthBackground` vì không có logo, chỉ có chữ chào. Chỉ CSS, không thêm
// thư viện.
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-900 px-4">
      <AuthBackground />

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="mb-6 flex justify-center">
          <img src={appIcon} alt="Lucky Draw Studio" className="h-28 w-28 rounded-3xl shadow-lg shadow-gold-500/25" draggable={false} />
        </div>
        {children}
      </div>
    </div>
  );
}
