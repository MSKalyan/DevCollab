import React from "react";

export default function SkillBar({ skill, percent }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider">
        <span className="text-ink">{skill}</span>
        <span className="font-medium text-ink-muted">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-merge transition-all duration-500"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}