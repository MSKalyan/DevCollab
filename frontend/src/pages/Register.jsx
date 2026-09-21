import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import AuthLayout from "../components/ui/AuthLayout";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import OAuthButtons from "../components/ui/OAuthButtons";
import { useToast } from "../components/ui/Toast";
import useOAuthSignIn from "../hooks/useOAuthSignIn";
import { User, Mail, Lock } from "lucide-react";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { signInWithGoogle, signInWithGithub, pending } = useOAuthSignIn();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      // No session yet — the address has to be confirmed first.
      toast.success("Check your email for the verification code.");
      navigate("/verify-email", {
        state: { email: res.data?.data?.email || form.email },
      });
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.message || "Registration failed";
      // An address already registered for real is a dead end here, so point at
      // sign-in rather than leaving the user to guess.
      if (err.response?.status === 409) {
        setError(`${msg} Sign in instead, or reset your password.`);
      } else {
        setError(msg);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join DevCollab and start sharing your work."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-soft hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons
        flow="signup"
        onGoogle={signInWithGoogle}
        onGithub={signInWithGithub}
        disabled={loading || Boolean(pending)}
      />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
        <span className="h-px flex-1 bg-line" />
        or sign up with email
        <span className="h-px flex-1 bg-line" />
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" name="name" value={form.name} onChange={set("name")} placeholder="Ada Lovelace" required icon={User} />
        <Input label="Email" type="email" name="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required autoComplete="email" icon={Mail} />
        <Input label="Password" type="password" name="password" value={form.password} onChange={set("password")} placeholder="••••••••" required autoComplete="new-password" icon={Lock} hint="At least 8 characters." />
        <Input label="Confirm Password" type="password" name="confirmPassword" value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="••••••••" required autoComplete="new-password" icon={Lock} />
        <Button type="submit" loading={loading} className="w-full" size="lg">Create account</Button>
        <p className="text-center text-xs text-ink-muted">
          We'll email you a 6-digit code to confirm your address.
        </p>
      </form>
    </AuthLayout>
  );
}
