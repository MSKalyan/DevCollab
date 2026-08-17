import React from "react";

export default function PageHeader({ title, subtitle, actions, className = "" }) {
  return (
    <div
      className={[
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      ].join(" ")}
    >
      <div>
        <h1 className="display text-[length:var(--step-3)]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
