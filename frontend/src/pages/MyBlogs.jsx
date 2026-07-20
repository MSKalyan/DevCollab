import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BlogCard from "../components/BlogCard";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Spinner";
import { ConfirmDialog } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { PenLine, FileText } from "lucide-react";
import api from "../api/api";

export default function MyBlogs() {
  const [name, setName] = useState("");
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const userRes = await api.get("/auth/me");
        setName(userRes.data.name);
        const blogRes = await api.get("/blogs/myblogs");
        if (active) setBlogs(blogRes.data.data || []);
      } catch {
        if (active) toast.error("Please log in to see your blogs.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/blogs/${pendingDelete.id}`);
      setBlogs((prev) => prev.filter((b) => b.id !== pendingDelete.id));
      toast.success("Blog deleted.");
    } catch {
      toast.error("Unable to delete this blog.");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={name ? `${name}'s Blogs` : "My Blogs"}
        subtitle="Manage the stories you've published."
        actions={<Button onClick={() => navigate("/create")}><PenLine className="h-4 w-4" /> New Blog</Button>}
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : !blogs || blogs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="You haven't written anything yet"
          description="Start your first post and share it with the community."
          action={<Button onClick={() => navigate("/create")}><PenLine className="h-4 w-4" /> Write a blog</Button>}
        />
      ) : (
        <div className="space-y-4">
          {blogs.map((blog) => (
            <BlogCard
              key={blog.id}
              blog={blog}
              name={name}
              showActions
              onEdit={(b) => navigate(`/blogs/${b.id}/edit`)}
              onDelete={(b) => setPendingDelete(b)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this blog?"
        message={pendingDelete ? `“${pendingDelete.title}” will be permanently removed. This action cannot be undone.` : ""}
        confirmLabel="Delete"
      />
    </div>
  );
}
