import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function Input({ label, error, hint, id, className = "", icon: Icon, type, ...props }) {
  const inputId = id || props.name;
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);

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
          type={isPassword && visible ? "text" : type}
          className={[
            "field",
            Icon ? "pl-9" : "",
            isPassword ? "pr-9" : "",
            error ? "field-error" : "",
            className,
          ].join(" ")}
          aria-invalid={!!error}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
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
