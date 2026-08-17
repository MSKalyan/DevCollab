import React from "react";

/**
 * Evidence stat strip: mono readouts like `PRs 12 · FORKS 3 · REVIEWS 7`.
 * The signature element of the design — real data in terminal form.
 */
export default function StatStrip({ stats = [], className = "" }) {
  return (
    <div className={`readout ${className}`}>
      {stats.map(({ label, value }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
    </div>
  );
}
