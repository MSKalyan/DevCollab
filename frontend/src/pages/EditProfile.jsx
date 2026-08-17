import React, { useEffect, useState } from "react";
import api from "../api/api";
import useAuth from "../hooks/useAuth";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { Save } from "lucide-react";

export default function EditProfile() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (user) {
      setName(user.name);
      setLoading(false);
    } else if (!authLoading) {
      setMessage("Please log in to view your profile.");
      setLoading(false);
    }
  }, [user, authLoading]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.put("/auth/update", { name, password });
      setMessage("Profile updated successfully.");
      toast.success("Profile updated successfully.");
      await refresh();
      setPassword("");
    } catch {
      setMessage("Error updating profile.");
      toast.error("Error updating profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <FullPageLoader label="Loading profile…" />;
  if (!user) return <p className="text-center text-sm text-ink-muted">{message}</p>;

  return (
    <PageShell
      eyebrow="account"
      title="My Profile"
      subtitle="Manage your account details."
    >
      <form onSubmit={handleUpdate} className="surface max-w-xl space-y-5 p-6">
        <div className="flex items-center gap-4 border-b border-line pb-5">
          <Avatar name={user.name} className="h-14 w-14 text-xl" />
          <div>
            <p className="text-sm font-medium text-ink">{user.name}</p>
            <p className="font-mono text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>

        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" value={user.email} disabled hint="Email cannot be changed." />
        <Input label="Role" value={user.role} disabled />
        <Input label="New Password" type="password" placeholder="Leave blank to keep current password" value={password} onChange={(e) => setPassword(e.target.value)} />

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" /> Update Profile
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
