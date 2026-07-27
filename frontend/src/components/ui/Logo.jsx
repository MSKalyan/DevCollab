import React from "react";
import { Link } from "react-router-dom";
import { Code2 } from "lucide-react";

export default function Logo({ to = "/", compact = false }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 rounded-xl text-ink transition hover:opacity-80"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-glow">
        <Code2 className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">DevCollab</span>
      )}
    </Link>
  );
}
