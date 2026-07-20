import React from "react";

export function Input({ label, error, hint, id, className = "", icon: Icon, ...props }) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        )}
        <input
          id={inputId}
          className={[
            "field",
            Icon ? "pl-9" : "",
            error ? "field-error" : "",
            className,
          ].join(" ")}
          aria-invalid={!!error}
          {...props}
        />
      </div>
      {error ? (
        <p className="field-error-msg">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Textarea({ label, error, hint, id, className = "", rows = 6, ...props }) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={[
          "field resize-y leading-relaxed",
          error ? "field-error" : "",
          className,
        ].join(" ")}
        aria-invalid={!!error}
        {...props}
      />
      {error ? (
        <p className="field-error-msg">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Select({ label, error, hint, id, className = "", children, ...props }) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={["field pr-9", error ? "field-error" : "", className].join(" ")}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p className="field-error-msg">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
