import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/api";
import AuthLayout from "../components/ui/AuthLayout";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import OAuthButtons from "../components/ui/OAuthButtons";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";
import { Mail, Lock } from "lucide-react";
import useOAuthSignIn, {
  GITHUB_CALLBACK_PARAM,
  OAUTH_ERROR_LABELS,
  POST_AUTH_PATH,
} from "../hooks/useOAuthSignIn";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const { signInWithGoogle, signInWithGithub, completeGithubSignIn, pending } = useOAuthSignIn();
  const [searchParams, setSearchParams] = useSearchParams();

  // GitHub sign-in returns as a full-page redirect with the session cookies
  // already set by the backend, so the only work here is re-reading the session.
  // The marker param keeps an ordinary visit to /login from doing this.
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      const msg = OAUTH_ERROR_LABELS[oauthError] || `Sign-in failed: ${oauthError}`;
      setError(msg);
      toast.error(msg);
      setSearchParams({}, { replace: true });
      return;
    }
    if (searchParams.get(GITHUB_CALLBACK_PARAM)) {
      completeGithubSignIn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(() => api.post("/auth/login", { email, password }));
      toast.success("Welcome back!");
      navigate(POST_AUTH_PATH);
    } catch (err) {
      const data = err.response?.data;
      // Unverified account: send the user to the code screen, which is where
      // the (possibly just re-sent) code gets entered.
      if (data?.code === "EMAIL_NOT_VERIFIED") {
        toast.info(data.code_sent ? "We sent a new verification code." : "Verify your email to continue.");
        navigate("/verify-email", { state: { email: data.data?.email || email, fromLogin: true } });
        return;
      }
      const msg = (data && (data.message || (typeof data === "string" ? data : null))) || "Login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to DevCollab"
      subtitle="Welcome back — let's build together."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-brand-soft hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <OAuthButtons
        onGoogle={signInWithGoogle}
        onGithub={signInWithGithub}
        disabled={loading || Boolean(pending)}
      />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
        <span className="h-px flex-1 bg-line" />
        or sign in with email
        <span className="h-px flex-1 bg-line" />
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" icon={Mail} />
        <Input label="Password" type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" icon={Lock} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-xs font-medium text-brand-soft hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
      </form>
    </AuthLayout>
  );
}
