/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070912",
        "bg-soft": "#0b0f1d",
        surface: "#111626",
        "surface-2": "#161c2e",
        line: "#232a40",
        "line-soft": "#1b2133",
        ink: "#e8ebf5",
        "ink-soft": "#aeb6cf",
        "ink-muted": "#6b7494",
        brand: {
          DEFAULT: "#6d5efc",
          soft: "#8b7dff",
          deep: "#4c3fd6",
        },
        accent: "#38bdf8",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { lg: "10px", xl: "14px", "2xl": "16px" },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0,0,0,0.6)",
        pop: "0 24px 60px -20px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(109,94,252,0.4), 0 12px 40px -12px rgba(109,94,252,0.5)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(0.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "toast-in": { "0%": { opacity: "0", transform: "translateY(-14px) scale(0.97)" }, "100%": { opacity: "1", transform: "translateY(0) scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.22s ease-out both",
        "toast-in": "toast-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
