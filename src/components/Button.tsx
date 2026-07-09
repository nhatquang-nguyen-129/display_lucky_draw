import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

const variants = {
  primary: "bg-gold-500 text-base-950 hover:bg-gold-400",
  secondary: "bg-base-800 text-base-100 hover:bg-base-700 border border-base-700",
  danger: "bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 border border-danger-500/30",
  ghost: "text-base-300 hover:text-base-100 hover:bg-base-800",
};

export default function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
