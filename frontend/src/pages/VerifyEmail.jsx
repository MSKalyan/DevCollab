import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MailCheck, ShieldCheck, RotateCw } from "lucide-react";
import api from "../api/api";
import AuthLayout from "../components/ui/AuthLayout";
import Button from "../components/ui/Button";
import OtpInput from "../components/ui/OtpInput";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";
import { POST_AUTH_PATH } from "../hooks/useOAuthSignIn";

// Second step of email sign-up: the account exists but has no session until the
// emailed code is confirmed. Reached from Register (and from Login when an
// unverified account tries to sign in), which pass the address in router state.
export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();

  const email = location.state?.email || "";
  const fromLogin = Boolean(location.state?.fromLogin);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Guards against verifying twice: onComplete fires from OtpInput and the
  // submit button hits the same path.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (value) => {
      const candidate = (value ?? code).trim();
      if (candidate.length !== 6 || submittingRef.current) return;

      submittingRef.current = true;
      setLoading(true);
      setError("");
      try {
        await login(() => api.post("/auth/verify-email", { email, code: candidate }));
        toast.success("Email verified — welcome to DevCollab!");
        navigate(POST_AUTH_PATH, { replace: true });
      } catch (err) {
        const msg = err.response?.data?.message || "That code did not work. Try again.";
        setError(msg);
        setCode("");
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [code, email, login, navigate, toast]
  );

  const resend = async () => {
    setResending(true);
    setError("");
    try {
      const res = await api.post("/auth/resend-verification", { email });
      toast.success("A new code is on its way.");
      setCooldown(res.data?.data?.retry_after ?? 60);
      setCode("");
    } catch (err) {
      const data = err.response?.data;
      if (data?.retry_after) setCooldown(data.retry_after);
      const msg = data?.message || "Could not send a new code. Try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setResending(false);
    }
  };

  // Without the address there is nothing to verify against — the page was opened
  // directly rather than through sign-up.
  if (!email) {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle="Start with your email address."
        footer={
          <Link to="/register" className="font-medium text-brand-soft hover:underline">
            Create an account
          </Link>
        }
      >
        <p className="text-center text-sm text-ink-muted">
          This page confirms the code we email you during sign-up. Create an account to get one.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email}.`}
      footer={
        <>
          Wrong address?{" "}
          <Link to="/register" className="font-medium text-brand-soft hover:underline">
            Start over
          </Link>
        </>
      }
    >
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-merge" aria-hidden="true" />
        <p className="text-sm text-ink-muted">
          {fromLogin
            ? "Your account is not confirmed yet. Enter the code to finish signing in."
            : "Enter the code to activate your account. It expires in 10 minutes."}
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-5"
      >
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={submit}
          disabled={loading || resending}
        />

        <Button type="submit" loading={loading} disabled={code.length !== 6} className="w-full" size="lg">
          <ShieldCheck className="h-4 w-4" />
          Verify and continue
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-xs text-ink-muted">
          Didn't get it? Check spam, then request another.
        </p>
        <Button
          variant="ghost"
          size="sm"
          loading={resending}
          disabled={cooldown > 0 || resending}
          onClick={resend}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </AuthLayout>
  );
}
