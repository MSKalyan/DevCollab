import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { Save, ArrowLeft } from "lucide-react";

export default function CreateBlog() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!title || !content || !category) { setError("Please fill in all required fields."); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      formData.append("category", category);
      if (image) formData.append("image", image);

      await api.post("/blogs/create", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Blog published successfully.");
      navigate("/myblogs");
    } catch (err) {
      const msg = err.response?.data?.message || "Error creating blog. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <PageHeader title="Create new blog" subtitle="Share a story with the community." />

      {error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-[#1c1010] px-4 py-3 text-sm font-medium text-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5 p-6">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="An insightful title" required />
        <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Engineering, Design, Life" required />
        <Textarea label="Content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your story…" required />

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
          <Button type="submit" loading={loading}><Save className="h-4 w-4" /> Publish Blog</Button>
        </div>
      </form>
    </div>
  );
}
