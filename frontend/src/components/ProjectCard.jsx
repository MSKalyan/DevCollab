import React from "react";
import { useNavigate } from "react-router-dom";
import { ImageOff, Github, ExternalLink } from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";
import Avatar from "./ui/Avatar";
import StatStrip from "./ui/StatStrip";

function ProjectCard({ project, showActions = false, onEdit, onDelete, onStar }) {
  const navigate = useNavigate();
  const ownerName = project.owner_name;
  const imageUrl = project.image
    ? (project.image.startsWith('http')
        ? project.image
        : `${process.env.REACT_APP_API_BASE_URL}/uploads/${project.image}`)
    : null;

  return (
    <article className="surface surface-hover animate-fade-in overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Avatar name={ownerName} className="h-6 w-6 text-[0.625rem]" />
            <span className="text-sm font-medium text-ink-soft">{ownerName}</span>
            {project.category && <span className="badge badge-neutral capitalize">{project.category}</span>}
            <StatusBadge status={project.status} />
          </div>

          <h3
            className="cursor-pointer truncate text-lg font-semibold text-ink transition hover:text-merge"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            {project.title}
          </h3>

          <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">
            {project.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags && project.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md border border-line bg-surface-3 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted capitalize"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
            <StatStrip
              stats={[
                { label: "★", value: project.star_count || 0 },
                { label: "⑂", value: project.fork_count || 0 },
                { label: "☰", value: project.review_count || 0 },
              ]}
            />

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
                View Project
              </Button>
              {project.github_url && (
                <a
                  href={project.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-surface-2 p-2 text-ink-muted transition hover:text-ink"
                  title="GitHub Repository"
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
              {project.live_url && (
                <a
                  href={project.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-surface-2 p-2 text-ink-muted transition hover:text-ink"
                  title="Live Demo"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {showActions && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => onEdit?.(project)}>
                    Edit
                  </Button>
                  <Button variant="dangerOutline" size="sm" onClick={() => onDelete?.(project)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div
          className="h-36 w-full shrink-0 cursor-pointer overflow-hidden rounded-lg bg-surface-2 sm:h-28 sm:w-44"
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={project.title} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-muted">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default ProjectCard;
