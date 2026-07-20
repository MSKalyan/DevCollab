import { useEffect, useState } from "react";
import BlogCard from "../components/BlogCard";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Spinner";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import api from "../api/api";

export default function BlogList() {
  const [name, setName] = useState("");
  const [blogs, setBlogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const userRes = await api.get("/auth/me");
        if (!active) return;
        setName(userRes.data.name);

        const blogRes = await api.get(`/blogs?page=${page}&limit=10`);
        if (!active) return;
        setBlogs(blogRes.data.blogs || []);
        setTotalPages(blogRes.data.totalPages || 1);
      } catch {
        if (active) setBlogs([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [page]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={name ? `Welcome, ${name}` : "Discover blogs"} subtitle="The latest stories from our community." />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : blogs.length === 0 ? (
        <EmptyState icon={FileText} title="No blogs yet" description="Be the first to publish a story for the community to read." />
      ) : (
        <>
          <div className="space-y-4">
            {blogs.map((blog) => <BlogCard key={blog.id} blog={blog} name={blog.author_name} />)}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <p className="text-sm text-ink-muted">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
