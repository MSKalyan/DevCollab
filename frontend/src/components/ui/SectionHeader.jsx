import React from "react";

/** Mono uppercase section marker used across list/detail pages. */
export default function SectionHeader({ children, count, className = "" }) {
  return (
    <div className={`mb-4 flex items-center gap-3 ${className}`}>
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {children}
      </h2>
      {typeof count === "number" && (
        <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-muted">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}
