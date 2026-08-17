import React from "react";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary:
    "bg-merge text-[#06120a] font-semibold shadow-[0_8px_24px_-10px_rgba(74,222,128,0.55)] hover:bg-[#5eea92] active:bg-merge-deep",
  secondary:
    "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-[#3d4d44] active:bg-surface-2",
  outline:
    "bg-transparent text-merge border border-merge/40 hover:bg-merge/10 active:bg-merge/20",
  ghost:
    "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-danger text-[#1a0b0b] shadow-[0_8px_24px_-10px_rgba(251,113,133,0.7)] hover:bg-[#ff8d9f] active:bg-[#e85d74]",
  dangerOutline:
    "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2",
  icon: "h-10 w-10 justify-center",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-all duration-200 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-merge focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        "active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
