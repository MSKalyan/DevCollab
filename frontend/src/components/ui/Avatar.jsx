import React from "react";

/** Consistent initial avatar: mono letter on a merge-tinted tile. */
export default function Avatar({ name = "", className = "" }) {
  const initial = name?.charAt(0)?.toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-md bg-merge/10 font-mono font-semibold text-merge ring-1 ring-merge/25",
        className || "h-9 w-9 text-sm",
      ].join(" ")}
    >
      {initial}
    </span>
  );
}
