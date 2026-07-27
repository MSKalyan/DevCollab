import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ProjectCard from "../components/ProjectCard";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Spinner";
import { FolderGit2, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import api from "../api/api";

export default function ProjectList() {
  const location = useLocation();
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get("search") || "");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [author, setAuthor] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get("search") || "");
    setPage(1);
  }, [location.search]);

  useEffect(() => {
    let active = true;
    const fetchTags = async () => {
      try {
        const res = await api.get("/projects/tags");
        if (active) setAllTags(res.data.data || []);
      } catch (err) {
        console.error("Error fetching tags:", err);
      }
    };
    fetchTags();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const userRes = await api.get("/auth/me");
        if (!active) return;
        setName(userRes.data.name);

        let url = `/projects?page=${page}&limit=10`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (tag) url += `&tag=${encodeURIComponent(tag)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (category) url += `&category=${encodeURIComponent(category)}`;
        if (author) url += `&author=${encodeURIComponent(author)}`;

        const projectRes = await api.get(url);
        if (!active) return;
        setProjects(projectRes.data.projects || []);
        setTotalPages(projectRes.data.totalPages || 1);
      } catch {
        if (active) setProjects([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [page, search, tag, status, category, author]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={name ? `Welcome, ${name}` : "Discover Projects"} subtitle="Explore innovative developer projects and find products to collaborate on." />

      {/* Filter and Search Controls */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Search projects, tags, or developers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="field pl-9"
            />
          </div>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
        </div>

        {showFilters && (
          <div className="card p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
            <div>
              <label className="field-label">Filter by Tag</label>
              <select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} className="field">
                <option value="">All Tech Tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Filter by Status</label>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="field">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="looking_for_collab">Looking for Collaboration</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="field-label">Filter by Category</label>
              <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="field">
                <option value="">All Categories</option>
                <option value="web">Web Application</option>
                <option value="mobile">Mobile App</option>
                <option value="ai_ml">AI / ML</option>
                <option value="blockchain">Blockchain / Web3</option>
                <option value="devtools">Developer Tools</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="field-label">Filter by Developer</label>
              <input value={author} onChange={(e) => { setAuthor(e.target.value); setPage(1); }} className="field" placeholder="Developer name" />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderGit2} title="No projects found" description="Be the first to share an amazing project for developers to review or join." />
      ) : (
        <>
          <div className="space-y-4">
            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
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
