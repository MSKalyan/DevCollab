import React from "react";

export default function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="surface flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-merge/10 text-merge">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-mono text-2xl font-semibold text-ink">{value}</p>
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
