import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Github } from "lucide-react";

// Provider buttons shared by sign-in and sign-up. Google renders its own
// origin-verified button (the widget is what mints a real ID token), so it is
// styled to sit at the same size; GitHub is our own link because it is a
// server-side redirect flow.
//
// `flow="signup"` only changes Google's button wording — the backend treats both
// identically: match by verified email, create when nothing matches.


export default function OAuthButtons({ onGoogle, onGithub, flow = "signin", disabled = false }) {
  const hasGoogle = Boolean(process.env.REACT_APP_GOOGLE_CLIENT_ID);

  return (
    <div className="space-y-3">
      {hasGoogle && (
        <div className={disabled ? "pointer-events-none opacity-55" : undefined}>
          <GoogleLogin
            onSuccess={onGoogle}
            onError={() => onGoogle({ error: true })}
            type="standard"
            theme="filled_black"
            size="large"
            shape="rectangular"
            text={flow === "signup" ? "signup_with" : "signin_with"}
            logo_alignment="left"
            width="100%"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onGithub}
        disabled={disabled}
        className={[
          "inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line",
          "bg-surface-2 text-sm font-medium text-ink transition-all duration-200",
          "hover:border-[#3d4d44] hover:bg-surface-3 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-merge focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed disabled:opacity-55",
        ].join(" ")}
      >
        <Github className="h-4 w-4" aria-hidden="true" />
        {flow === "signup" ? "Sign up with GitHub" : "Sign in with GitHub"}
      </button>

      {/* Google's widget does not expose its mark to us, so the shared divider
          carries the "either way" promise instead of each button repeating it. */}
      {hasGoogle && (
        <p className="pt-1 text-center text-xs text-ink-muted">
          We verify your email either way — Google accounts skip the code.
        </p>
      )}
    </div>
  );
}
