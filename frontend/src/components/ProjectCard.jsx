import React from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, ImageOff, Star, GitFork, MessageSquare, Github, ExternalLink } from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

function ProjectCard({ project, showActions = false, onEdit, onDelete, onStar }) {
  const navigate = useNavigate();
  const ownerName = project.owner_name;
  const imageUrl = project.image
    ? (project.image.startsWith('http')
        ? project.image
        : `${process.env.REACT_APP_API_BASE_URL}/uploads/${project.image}`)
    : null;

  return (
    <article className="card card-hover flex flex-col gap-5 p-5 sm:flex-row sm:items-center animate-fade-in">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-[10px] font-semibold text-white uppercase">
            {ownerName?.charAt(0) || "U"}
          </span>
          <span className="font-medium text-ink-soft">{ownerName}</span>
          {project.category && <span className="badge badge-neutral capitalize">{project.category}</span>}
          <StatusBadge status={project.status} />
        </div>

        <h3 className="truncate text-lg font-semibold text-ink hover:text-brand transition cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
          {project.title}
        </h3>

        <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">
          {project.description}
        </p>

        {/* Project Links & Tech Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags && project.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-lg bg-surface-3 border border-line px-2 py-0.5 text-xs text-ink-muted capitalize">
              {tag}
            </span>
          ))}
        </div>

        {/* Project Stats & Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-3">
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-500" />
              {project.star_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="h-4 w-4 text-brand-soft" />
              {project.fork_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              {project.review_count || 0}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate(`/projects/${project.id}`)}>View Project</Button>
            {project.github_url && (
              <a href={project.github_url} target="_blank" rel="noopener noreferrer" className="p-2 text-ink-muted hover:text-ink rounded-lg bg-surface-2 transition" title="GitHub Repository">
                <Github className="h-4 w-4" />
              </a>
            )}
            {project.live_url && (
              <a href={project.live_url} target="_blank" rel="noopener noreferrer" className="p-2 text-ink-muted hover:text-ink rounded-lg bg-surface-2 transition" title="Live Demo">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {showActions && (
              <>
                <Button variant="secondary" size="sm" onClick={() => onEdit?.(project)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="dangerOutline" size="sm" onClick={() => onDelete?.(project)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="h-36 w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-28 sm:w-44 cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
        {imageUrl ? (
          <img src={imageUrl} alt={project.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>
    </article>
  );
}

export default ProjectCard;
