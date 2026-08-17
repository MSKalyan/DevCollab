import React from "react";
import Logo from "./Logo";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex max-w-md flex-col justify-center py-6">
      <div className="mb-8 text-center">
        <div className="mb-5 flex justify-center">
          <Logo />
        </div>
        <p className="eyebrow mb-2">devcollab</p>
        <h1 className="display text-[length:var(--step-3)]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>

      <div className="surface p-7 animate-fade-in">{children}</div>

      {footer && (
        <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>
      )}
    </div>
  );
}
