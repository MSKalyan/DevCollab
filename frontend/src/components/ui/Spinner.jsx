import React from "react";
import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-5 w-5 text-brand-soft", label }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <Loader2 className={`${className} animate-spin`} />
      {label && <span className="text-sm text-ink-muted">{label}</span>}
    </span>
  );
}

export function FullPageLoader({ label = "Loading…" }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-brand-soft" />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card flex items-center gap-5 p-5">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="hidden h-24 w-24 rounded-xl sm:block" />
    </div>
  );
}
