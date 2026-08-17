import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import { Input, Textarea, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import TechStackSelector from "../components/TechStackSelector";
import { Save, ArrowLeft } from "lucide-react";

export default function CreateProject() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("web");
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [status, setStatus] = useState("active");
  const [tags, setTags] = useState([]);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title || !description || !category) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("category", category);
      formData.append("github_url", githubUrl);
      formData.append("live_url", liveUrl);
      formData.append("status", status);

      tags.forEach((tag) => formData.append("tags", tag));

      if (image) formData.append("image", image);

      await api.post("/projects/create", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Project shared successfully.");
      navigate("/myprojects");
    } catch (err) {
      const msg = err.response?.data?.message || "Error sharing project. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      eyebrow="new"
      title="Share new project"
      subtitle="Showcase your creation and get feedback from the developer community."
      className="mx-auto max-w-2xl"
    >
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {error && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="surface space-y-5 p-6">
        <Input
          label="Project Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="An innovative tool, SaaS, CLI, etc."
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="web">Web Application</option>
            <option value="mobile">Mobile App</option>
            <option value="ai_ml">AI / ML</option>
            <option value="blockchain">Blockchain / Web3</option>
            <option value="devtools">Developer Tools</option>
            <option value="other">Other</option>
          </Select>

          <Select
            label="Collaboration Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            required
          >
            <option value="active">Active (Showcase only)</option>
            <option value="looking_for_collab">Looking for Collaboration (Open to joiners)</option>
            <option value="archived">Archived</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="GitHub Repository URL (Optional)"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/..."
          />
          <Input
            label="Live Demo URL (Optional)"
            value={liveUrl}
            onChange={(e) => setLiveUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <TechStackSelector selectedTags={tags} onChange={setTags} />

        <Textarea
          label="Project Description"
          rows={10}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your project, why you built it, how to run it, and what tech stack choices you made..."
          required
        />

        <div>
          <label className="field-label">Project Cover Image / Screenshot</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-merge/10 file:px-4 file:py-2 file:font-mono file:text-xs file:font-medium file:text-merge hover:file:bg-merge/20"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={() => navigate("/myprojects")}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            <Save className="h-4 w-4" /> Share Project
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
