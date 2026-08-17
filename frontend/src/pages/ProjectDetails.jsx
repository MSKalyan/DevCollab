import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import ReviewSection from "../components/ReviewSection";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import Avatar from "../components/ui/Avatar";
import StatStrip from "../components/ui/StatStrip";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";
import { Github, ExternalLink, Star, GitFork, ArrowLeft, Handshake } from "lucide-react";
import StatusBadge from "../components/ui/StatusBadge";

export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starLoading, setStarLoading] = useState(false);
  const [forkLoading, setForkLoading] = useState(false);
  const [collabLoading, setCollabLoading] = useState(false);
  const [collabMessage, setCollabMessage] = useState("");
  const [showCollabModal, setShowCollabModal] = useState(false);

  const fetchDetails = async () => {
    try {
      const res = await api.get(`/projects/${id}`);
      setData(res.data.data);
    } catch (err) {
      toast.error("Project not found or server error.");
      navigate("/projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line
  }, [id]);

  const handleStar = async () => {
    if (starLoading) return;
    setStarLoading(true);
    try {
      const res = await api.post(`/projects/${id}/star`);
      const starResult = res.data.data || {};
      setData((prev) => ({
        ...prev,
        starred: starResult.starred,
        starCount: starResult.starCount,
      }));
      toast.success(starResult.starred ? "Added to starred projects" : "Removed star");
    } catch {
      toast.error("Failed to star project.");
    } finally {
      setStarLoading(false);
    }
  };

  const handleFork = async () => {
    if (forkLoading) return;
    if (window.confirm("Do you want to fork this project to your repository?")) {
      setForkLoading(true);
      try {
        const res = await api.post(`/projects/${id}/fork`);
        toast.success("Project forked successfully!");
        navigate(`/projects/${res.data.data?.id}`);
      } catch (err) {
        toast.error("Failed to fork project.");
      } finally {
        setForkLoading(false);
      }
    }
  };

  const handleCollabRequest = async (e) => {
    e.preventDefault();
    if (!collabMessage.trim()) return;
    setCollabLoading(true);
    try {
      await api.post(`/projects/${id}/collab`, { message: collabMessage.trim() });
      toast.success("Collaboration request sent successfully!");
      setShowCollabModal(false);
      setCollabMessage("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send collaboration request.");
    } finally {
      setCollabLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { project, tags, starCount, forkCount, starred } = data;
  const isOwner = project.owner_id === user?.id;

  const imageUrl = project.image
    ? (project.image.startsWith("http")
        ? project.image
        : `${process.env.REACT_APP_API_BASE_URL}/uploads/${project.image}`)
    : null;

  return (
    <PageShell className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Button>

      <article className="animate-fade-in space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Avatar name={project.owner_name} className="h-6 w-6 text-[0.625rem]" />
              <span className="text-sm font-medium text-ink-soft">{project.owner_name}</span>
              {project.category && <span className="badge badge-neutral capitalize">{project.category}</span>}
              <StatusBadge status={project.status} />
            </div>
            <h1 className="display mt-3 text-[length:var(--step-4)]">
              {project.title}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={starred ? "brand" : "outline"}
              size="md"
              loading={starLoading}
              onClick={handleStar}
            >
              <Star className={["h-4 w-4", starred ? "fill-white" : ""].join(" ")} />
              {starred ? "Starred" : "Star"} ({starCount})
            </Button>

            {!isOwner && (
              <Button variant="outline" size="md" loading={forkLoading} onClick={handleFork}>
                <GitFork className="h-4 w-4" />
                Fork ({forkCount})
              </Button>
            )}

            {!isOwner && project.status === "looking_for_collab" && (
              <Button variant="brand" size="md" onClick={() => setShowCollabModal(true)}>
                <Handshake className="h-4 w-4" />
                Collab
              </Button>
            )}
          </div>
        </div>

        {imageUrl && (
          <div className="aspect-[21/9] w-full overflow-hidden rounded-xl bg-surface-2 border border-line">
            <img src={imageUrl} alt={project.title} className="h-full w-full object-cover" />
          </div>
        )}

        <StatStrip
          stats={[
            { label: "Stars", value: starCount },
            { label: "Forks", value: forkCount },
            { label: "Reviews", value: data.reviewCount ?? "—" },
          ]}
        />

        {/* Tags Section */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-merge/10 px-3 py-1 font-mono text-xs font-medium text-merge border border-merge/20 capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-line/60 pt-6">
          <p className="whitespace-pre-line text-lg leading-relaxed text-ink-soft">
            {project.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 border-y border-line py-4">
          {project.github_url && (
            <a href={project.github_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <Github className="h-4 w-4" />
                View GitHub Repository
              </Button>
            </a>
          )}
          {project.live_url && (
            <a href={project.live_url} target="_blank" rel="noopener noreferrer">
              <Button>
                <ExternalLink className="h-4 w-4" />
                Visit Live Demo
              </Button>
            </a>
          )}
        </div>
      </article>

      {/* Collaboration Modal */}
      {showCollabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="surface w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-lg font-semibold text-ink">Request Collaboration</h3>
            <p className="text-sm text-ink-muted">
              Explain why you want to collaborate on <strong>{project.title}</strong> and what skills you bring to the table.
            </p>
            <form onSubmit={handleCollabRequest} className="space-y-4">
              <textarea
                value={collabMessage}
                onChange={(e) => setCollabMessage(e.target.value)}
                placeholder="Hi! I am a React/Node developer and would love to help you build..."
                className="field min-h-[100px] resize-y"
                required
              />
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setShowCollabModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={collabLoading}>
                  Send Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Code Feedback / Review Section */}
      <ReviewSection projectId={project.id} />
    </PageShell>
  );
}
