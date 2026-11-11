import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm"; // "sm" = toolbar/modal footer dày đặc nút (vd SessionsModal.tsx) — gọn hơn mặc định
}

const variants = {
  primary: "bg-gold-500 text-base-950 hover:bg-gold-400",
  secondary: "bg-base-800 text-base-100 hover:bg-base-700 border border-base-700",
  danger: "bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 border border-danger-500/30",
  ghost: "text-base-300 hover:text-base-100 hover:bg-base-800",
};

const sizes = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-1 text-xs",
};

export default function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
