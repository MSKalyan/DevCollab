import React from "react";

export function Card({ className = "", children, hover = false, ...props }) {
  return (
    <div
      className={["surface p-6", hover ? "surface-hover" : "", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ variant = "neutral", className = "", children }) {
  const map = {
    neutral: "badge-neutral",
    brand: "badge-brand",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
  };
  return (
    <span className={["badge", map[variant], className].join(" ")}>{children}</span>
  );
}
