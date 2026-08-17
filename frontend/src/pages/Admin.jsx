import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import { Badge } from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import { FullPageLoader } from "../components/ui/Spinner";
import { ConfirmDialog } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { Users, FolderGit2, Trash2, Eye, ShieldCheck, LayoutDashboard } from "lucide-react";

function Kpi({ icon: Icon, label, value, tint }) {
  return (
    <div className="surface flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-mono text-2xl font-semibold text-ink">{value}</p>
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">{label}</p>
      </div>
    </div>
  );
}

function Table({ headers, children }) {
  return (
    <div className="surface overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-muted">
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-5 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await api.get("/admin/adminpanel");
        setUsers(userRes.data.data?.users || []);
        const projectRes = await api.get("/admin/projects");
        setProjects(projectRes.data.data?.projects || []);
      } catch {
        toast.error("Failed to load admin data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.type === "user") {
        await api.delete(`/admin/users/${pending.item.id}`);
        setUsers((prev) => prev.filter((u) => u.id !== pending.item.id));
        toast.success("User deleted.");
      } else {
        await api.delete(`/admin/projects/${pending.item.id}`);
        setProjects((prev) => prev.filter((project) => project.id !== pending.item.id));
        toast.success("Project deleted.");
      }
    } catch {
      toast.error("Could not delete. Please try again.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  if (loading) return <FullPageLoader label="Loading admin dashboard…" />;

  return (
    <PageShell
      eyebrow="control"
      title="Admin Dashboard"
      subtitle="Oversee users and published content."
      actions={
        <span className="badge badge-brand">
          <ShieldCheck className="h-3.5 w-3.5" /> Admin
        </span>
      }
    >
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi icon={Users} label="Total Users" value={users.length} tint="bg-merge/10 text-merge" />
        <Kpi icon={FolderGit2} label="Total Projects" value={projects.length} tint="bg-accent/10 text-accent" />
        <Kpi icon={LayoutDashboard} label="Admins" value={users.filter((u) => u.role === "admin").length} tint="bg-merge/10 text-merge" />
      </div>

      <section className="mb-12">
        <SectionHeader count={users.length}>Manage users</SectionHeader>
        {users.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <Table headers={["User", "Email", "Role", "Actions"]}>
            {users.map((u) => (
              <tr key={u.id} className="transition hover:bg-surface-2">
                <td className="px-5 py-3.5 font-medium text-ink">{u.name}</td>
                <td className="px-5 py-3.5 text-ink-muted">{u.email}</td>
                <td className="px-5 py-3.5"><Badge variant={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge></td>
                <td className="px-5 py-3.5 text-right">
                  <Button variant="dangerOutline" size="sm" onClick={() => setPending({ type: "user", item: u })}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <SectionHeader count={projects.length}>Manage projects</SectionHeader>
        {projects.length === 0 ? (
          <EmptyState icon={FolderGit2} title="No projects found" />
        ) : (
          <Table headers={["Title", "Author", "Actions"]}>
            {projects.map((b) => (
              <tr key={b.id} className="transition hover:bg-surface-2">
                <td className="px-5 py-3.5 font-medium text-ink">{b.title}</td>
                <td className="px-5 py-3.5 text-ink-muted">{b.author_name}</td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-2">
                    <Link to={`/projects/${b.id}`}>
                      <Button variant="secondary" size="sm"><Eye className="h-4 w-4" /> View</Button>
                    </Link>
                    <Button variant="dangerOutline" size="sm" onClick={() => setPending({ type: "project", item: b })}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Delete ${pending?.type === "user" ? "user" : "project"}?`}
        message={pending ? `“${pending.item.name || pending.item.title}” will be permanently removed.` : ""}
        confirmLabel="Delete"
      />
    </PageShell>
  );
}
