import React from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, ImageOff } from "lucide-react";
import Button from "./ui/Button";

function BlogCard({ blog, name, showActions = false, onEdit, onDelete }) {
  const navigate = useNavigate();
  const authorName = blog.author_name || name;
  const imageUrl = blog.image
    ? (blog.image.startsWith('http')
        ? blog.image
        : `${process.env.REACT_APP_API_BASE_URL}/uploads/${blog.image}`)
    : null;

  return (
    <article className="card card-hover flex flex-col gap-5 p-5 sm:flex-row sm:items-center animate-fade-in">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="font-medium text-ink-soft">{authorName}</span>
          {blog.category && <span className="badge badge-neutral">{blog.category}</span>}
        </div>

        <h3 className="truncate text-lg font-semibold text-ink">{blog.title}</h3>

        <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">
          {blog.content?.slice(0, 160)}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" onClick={() => navigate(`/blogs/${blog.id}`)}>Read more</Button>
          {showActions && (
            <>
              <Button variant="secondary" size="sm" onClick={() => onEdit?.(blog)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="dangerOutline" size="sm" onClick={() => onDelete?.(blog)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="h-36 w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-28 sm:w-44">
        {imageUrl ? (
          <img src={imageUrl} alt={blog.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>
    </article>
  );
}

export default BlogCard;
