import React, { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };

const STYLES = {
  success: "border-merge/40 bg-[#0d1712] text-merge",
  error: "border-danger/40 bg-[#1c1013] text-danger",
  warning: "border-warning/40 bg-[#1c1708] text-warning",
  info: "border-rebase/40 bg-[#15122b] text-rebase",
};

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (type, message, opts = {}) => {
      const id = ++idCounter;
      const duration = opts.duration ?? 3500;
      setToasts((prev) => [...prev, { id, type, message, ...opts }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const helpers = {
    success: (m, o) => toast("success", m, o),
    error: (m, o) => toast("error", m, o),
    warning: (m, o) => toast("warning", m, o),
    info: (m, o) => toast("info", m, o),
  };

  return (
    <ToastContext.Provider value={helpers}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed top-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-3">
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <div
                key={t.id}
                role="status"
                className={[
                  "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-pop animate-toast-in",
                  STYLES[t.type],
                ].join(" ")}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="text-ink-muted transition hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || {};
}
