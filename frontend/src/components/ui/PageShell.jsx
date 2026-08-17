import React from "react";

/**
 * Shared page scaffolding: mono eyebrow + serif display title + optional
 * action slot. Every top-level page uses this so headers stay consistent.
 */
export default function PageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "",
  children,
}) {
  return (
    <div className={`page-shell animate-fade-in ${className}`}>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2 truncate">{eyebrow}</p>}
          <h1 className="display text-[length:var(--step-3)]">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </header>
      {children}
    </div>
  );
}
