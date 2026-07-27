import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import AuthLayout from "../components/ui/AuthLayout";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";
import { User, Mail, Lock } from "lucide-react";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();

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
      await login(() => api.post("/auth/register", { name: form.name, email: form.email, password: form.password }));
      toast.success("Account created — welcome to DevCollab!");
      navigate("/projects");
    } catch (err) {
      const msg = err.response?.data?.message || "Registration failed";
      setError(msg);
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
      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" name="name" value={form.name} onChange={set("name")} placeholder="Ada Lovelace" required icon={User} />
        <Input label="Email" type="email" name="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required icon={Mail} />
        <Input label="Password" type="password" name="password" value={form.password} onChange={set("password")} placeholder="••••••••" required icon={Lock} />
        <Input label="Confirm Password" type="password" name="confirmPassword" value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="••••••••" required icon={Lock} />
        <Button type="submit" loading={loading} className="w-full" size="lg">Create account</Button>
      </form>
    </AuthLayout>
  );
}
