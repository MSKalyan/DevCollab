import React, { useEffect, useRef } from "react";

// Six single-character boxes that behave like one input: typing advances,
// backspace retreats, and pasting a whole code fills every slot. The value is
// always exposed as the joined string so the caller never sees the slots.
export default function OtpInput({ value, onChange, onComplete, disabled = false, length = 6 }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  // Focus the first empty box on mount so the user can just start typing.
  useEffect(() => {
    const firstEmpty = digits.findIndex((d) => d === "");
    refs.current[firstEmpty === -1 ? 0 : firstEmpty]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next) => {
    onChange(next);
    if (next.length === length && /^\d+$/.test(next)) onComplete?.(next);
  };

  const setAt = (index, char) => {
    const chars = [...digits];
    chars[index] = char;
    commit(chars.join("").slice(0, length));
  };

  const handleChange = (index) => (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setAt(index, "");
      return;
    }
    // A paste (or fast typing) can land several digits in one slot.
    if (raw.length > 1) {
      const chars = [...digits];
      for (let i = 0; i < raw.length && index + i < length; i += 1) {
        chars[index + i] = raw[i];
      }
      commit(chars.join(""));
      refs.current[Math.min(index + raw.length, length - 1)]?.focus();
      return;
    }
    setAt(index, raw);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setAt(index - 1, "");
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (index) => (e) => {
    const text = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    const chars = [...digits];
    for (let i = 0; i < text.length && index + i < length; i += 1) chars[index + i] = text[i];
    commit(chars.join(""));
    refs.current[Math.min(index + text.length, length - 1)]?.focus();
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <React.Fragment key={i}>
          <input
            ref={(el) => (refs.current[i] = el)}
            value={digit}
            onChange={handleChange(i)}
            onKeyDown={handleKeyDown(i)}
            onPaste={handlePaste(i)}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            maxLength={length}
            className={[
              "h-[3.25rem] min-w-0 flex-1 rounded-lg border bg-surface-2 text-center font-mono",
              "font-semibold text-[length:var(--step-2)] text-ink transition-colors duration-150",
              "border-line hover:border-[#3d4d44] focus:border-merge",
              "focus:shadow-[0_0_0_3px_rgba(74,222,128,0.18)] focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-55",
            ].join(" ")}
          />
          {i === Math.floor(length / 2) - 1 && (
            <span aria-hidden="true" className="px-0.5 text-ink-muted">
              &ndash;
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
