import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import { Input, Textarea, Select } from "../components/ui/Input";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import TechStackSelector from "../components/TechStackSelector";

export default function EditProject() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [tags, setTags] = useState([]);
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then((res) => {
        const d = res.data.data || {};
        const project = d.project;
        setForm({
          title: project.title,
          description: project.description,
          category: project.category || "web",
          github_url: project.github_url || "",
          live_url: project.live_url || "",
          status: project.status || "active",
        });
        setTags(d.tags || []);
      })
      .catch(() => {
        toast.error("Could not load this project.");
        navigate("/myprojects");
      });
  }, [id, navigate, toast]);

  if (!form) return <FullPageLoader label="Loading project…" />;

  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      tags.forEach((tag) => data.append("tags", tag));
      if (image) data.append("image", image);
      await api.post(`/projects/${id}/edit`, data, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Project updated.");
      navigate(`/projects/${id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      eyebrow="edit"
      title="Edit project"
      subtitle="Keep your project details current."
      className="mx-auto max-w-2xl"
    >
      <form onSubmit={submit} className="surface space-y-5 p-6">
        <Input label="Project title" value={form.title} onChange={set("title")} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={form.category} onChange={set("category")}>
            <option value="web">Web Application</option>
            <option value="mobile">Mobile App</option>
            <option value="ai_ml">AI / ML</option>
            <option value="blockchain">Blockchain / Web3</option>
            <option value="devtools">Developer Tools</option>
            <option value="other">Other</option>
          </Select>
          <Select label="Collaboration status" value={form.status} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="looking_for_collab">Looking for Collaboration</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="GitHub URL" value={form.github_url} onChange={set("github_url")} />
          <Input label="Live demo URL" value={form.live_url} onChange={set("live_url")} />
        </div>
        <TechStackSelector selectedTags={tags} onChange={setTags} />
        <Textarea label="Description" rows={10} value={form.description} onChange={set("description")} required />
        <div>
          <label className="field-label">Replace cover image</label>
          <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files[0])} className="field" />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={saving}>Save project</Button>
        </div>
      </form>
    </PageShell>
  );
}
