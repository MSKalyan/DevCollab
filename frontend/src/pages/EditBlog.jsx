import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/api";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { Save, ArrowLeft } from "lucide-react";

export default function EditBlog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ title: "", category: "", content: "" });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBlog = async () => {
      try {
        const res = await api.get(`/blogs/${id}`);
        const blog = res.data?.data?.blog;
        setForm({ title: blog.title || "", category: blog.category || "", content: blog.content || "" });
      } catch {
        toast.error("Could not load this blog.");
        navigate("/myblogs");
      } finally {
        setLoading(false);
      }
    };
    fetchBlog();
    // eslint-disable-next-line
  }, [id]);

  if (loading) return <FullPageLoader label="Loading blog…" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title || !form.content || !form.category) { setError("Please fill in all required fields."); return; }
    setSaving(true);
    try {
      const data = new FormData();
      data.append("title", form.title);
      data.append("content", form.content);
      data.append("category", form.category);
      if (image) data.append("image", image);

      await api.post(`/blogs/${id}/edit`, data, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Blog updated successfully.");
      navigate("/myblogs");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to update blog.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <PageHeader title="Edit blog" subtitle="Update your post and publish changes." />

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5 p-6">
        <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="An insightful title" required />
        <Input label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Engineering" required />
        <Textarea label="Content" rows={10} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Write your story…" required />
        <div>
          <label className="field-label">Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-xl file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-soft hover:file:bg-brand/20"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={() => navigate("/myblogs")}>Cancel</Button>
          <Button type="submit" loading={saving}><Save className="h-4 w-4" /> Save changes</Button>
        </div>
      </form>
    </div>
  );
}
