import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import api from "../api/api";
import AuthLayout from "../components/ui/AuthLayout";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";
import { Mail, Lock } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const googleClientId = null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(() => api.post("/auth/login", { email, password }));
      toast.success("Welcome back!");
      navigate("/projects");
    } catch (err) {
      const data = err.response?.data;
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
      {googleClientId && (
        <div className="mb-6">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                await login(() => api.post("/auth/google", { credential: credentialResponse.credential }));
                toast.success("Signed in with Google");
                navigate("/projects");
              } catch {
                toast.error("Google login failed");
              }
            }}
            onError={() => toast.error("Google login failed")}
          />
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" icon={Mail} />
        <Input label="Password" type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" icon={Lock} />
        <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
      </form>
    </AuthLayout>
  );
}
