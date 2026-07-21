import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/api";
import CommentSection from "../components/CommentSection";
import Button from "../components/ui/Button";
import { Skeleton } from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { ArrowLeft, ImageOff, Calendar } from "lucide-react";

export default function BlogDetails() {
  const { id } = useParams();
  const toast = useToast();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBlog = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/blogs/${id}`);
        setBlog(res.data.data.blog);
      } catch {
        setNotFound(true);
        toast.error("Could not load this blog.");
      } finally {
        setLoading(false);
      }
    };
    fetchBlog();
    // eslint-disable-next-line
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="mb-6 h-10 w-3/4" />
        <Skeleton className="mb-3 h-4 w-full" />
        <Skeleton className="mb-3 h-4 w-full" />
        <Skeleton className="mb-8 h-4 w-2/3" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={ImageOff}
          title="Blog not found"
          description="This post may have been removed or is no longer available."
          action={<Link to="/blogs"><Button variant="secondary">Back to blogs</Button></Link>}
        />
      </div>
    );
  }

  const imageUrl = blog.image
    ? (blog.image.startsWith('http')
        ? blog.image
        : `${process.env.REACT_APP_API_BASE_URL}/uploads/${blog.image}`)
    : null;

  return (
    <article className="mx-auto max-w-3xl animate-fade-in">
      <Link to="/blogs" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-brand-soft">
        <ArrowLeft className="h-4 w-4" /> Back to blogs
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className="font-medium text-ink-soft">{blog.author_name || blog.author}</span>
        {blog.category && <span className="badge badge-neutral">{blog.category}</span>}
        {blog.created_at && (
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(blog.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </span>
        )}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{blog.title}</h1>

      {imageUrl && (
        <img src={imageUrl} alt={blog.title} className="mt-6 max-h-[420px] w-full rounded-2xl border border-line object-cover" />
      )}

      <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{blog.content}</div>

      <CommentSection blogId={id} />
    </article>
  );
}
