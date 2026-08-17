/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f0e",
        "bg-soft": "#0e1311",
        surface: "#121816",
        "surface-2": "#1b231f",
        "surface-3": "#243027",
        line: "#2e3b34",
        "line-soft": "#222c26",
        ink: "#e8f0ea",
        "ink-soft": "#a9bcaf",
        "ink-muted": "#77897d",
        merge: {
          DEFAULT: "#4ade80",
          deep: "#16a34a",
          soft: "rgba(74, 222, 128, 0.12)",
        },
        rebase: "#a78bfa",
        accent: "#38bdf8",
        success: "#4ade80",
        warning: "#fbbf24",
        danger: "#fb7185",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Newsreader", "ui-serif", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "10px",
        xl: "12px",
        "2xl": "14px",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0,0,0,0.6)",
        pop: "0 24px 60px -20px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(74,222,128,0.35), 0 12px 40px -12px rgba(74,222,128,0.35)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(0.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "toast-in": { "0%": { opacity: "0", transform: "translateY(-14px) scale(0.97)" }, "100%": { opacity: "1", transform: "translateY(0) scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.22s ease-out both",
        "toast-in": "toast-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        blink: "blink 1.1s step-end infinite",
      },
    },
  },
  plugins: [],
};
