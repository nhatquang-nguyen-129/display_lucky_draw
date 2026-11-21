import { ReactNode } from "react";
import appIcon from "@/assets/app-icon-256.png";

// Vài đốm màu thương hiệu mờ phía sau các màn trước khi vào app — tắt khi hệ điều hành bật "giảm
// chuyển động" (index.css). 2 biến thể:
// - "default" (Sign in/Reset): gần như đứng yên, rất mờ — màn nhìn lâu, không cần chuyển động rõ.
// - "welcome" (Access Code/Create Admin Account/màn chào mừng sau khi tạo admin — CỐ ĐỊNH style này
//   cho cả 3 màn, giống hệt nhau): đậm màu, trôi nhanh, "nhận ra ngay" là nền đang chuyển động.
export function AuthBackground({ variant = "default" }: { variant?: "default" | "welcome" }) {
  if (variant === "welcome") {
    // blur-[90px] (thay blur-3xl=64px) — mép mờ lan rộng hơn, nhạt dần nhẹ nhàng hơn, đỡ tương phản gắt
    // trên nền trắng. Alpha màu cũng giảm (60/65/60% → 40/45/40%) cho bớt chói.
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="welcome-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold-500/40 blur-[90px]" style={{ animationDuration: "11s" }} />
        <div
          className="welcome-blob absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-teal-500/45 blur-[90px]"
          style={{ animationDuration: "14s", animationDelay: "-4s" }}
        />
        <div
          className="welcome-blob absolute right-1/4 top-10 h-64 w-64 rounded-full bg-highlight-500/40 blur-[90px]"
          style={{ animationDuration: "9s", animationDelay: "-2s" }}
        />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="auth-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold-500/20 blur-3xl" />
      <div className="auth-blob absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-teal-500/25 blur-3xl" style={{ animationDelay: "-8s" }} />
      <div className="auth-blob absolute right-1/4 top-10 h-64 w-64 rounded-full bg-highlight-500/20 blur-3xl" style={{ animationDelay: "-15s" }} />
    </div>
  );
}

// Khung chung cho các màn TRƯỚC khi vào app (kích hoạt, đăng nhập, quên mật khẩu, không có mạng): nền
// sáng với đốm màu phía sau, logo app ở trên cùng. Màn Welcome (Login.tsx) KHÔNG dùng khung này — tự
// dựng nền riêng qua `AuthBackground` vì không có logo, chỉ có chữ chào. Chỉ CSS, không thêm thư viện.
// `backgroundVariant`: Login.tsx truyền "welcome" cho màn Access Code/Create Admin Account (nền chuyển
// động rõ ngay từ đầu, giống hệt màn chào mừng — không đợi tới lúc đó mới chuyển động), "default" cho
// Sign in/Reset.
export default function AuthShell({
  children,
  backgroundVariant = "default",
}: {
  children: ReactNode;
  backgroundVariant?: "default" | "welcome";
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-900 px-4">
      <AuthBackground variant={backgroundVariant} />

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="mb-6 flex justify-center">
          <img src={appIcon} alt="Lucky Draw Studio" className="h-28 w-28 rounded-3xl shadow-lg shadow-gold-500/25" draggable={false} />
        </div>
        {children}
      </div>
    </div>
  );
}
