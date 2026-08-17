import React from "react";
import { Link } from "react-router-dom";
import { GitMerge } from "lucide-react";

export default function Logo({ to = "/", compact = false }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 rounded-lg text-ink transition hover:opacity-80"
      aria-label="DevCollab home"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-merge/15 text-merge ring-1 ring-merge/40">
        <GitMerge className="h-4.5 w-4.5" />
      </span>
      {!compact && (
        <span className="font-mono text-base font-semibold tracking-tight">
          dev<span className="text-merge">collab</span>
        </span>
      )}
    </Link>
  );
}
