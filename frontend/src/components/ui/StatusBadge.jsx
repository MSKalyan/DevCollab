import React from "react";

export default function StatusBadge({ status }) {
  let classes = "badge badge-neutral";
  let text = "Active";

  if (status === "looking_for_collab") {
    classes = "badge badge-brand";
    text = "Looking For Collaboration";
  } else if (status === "archived") {
    classes = "badge bg-surface-3 text-ink-muted border border-line";
    text = "Archived";
  }

  return (
    <span className={classes}>
      {text}
    </span>
  );
}
