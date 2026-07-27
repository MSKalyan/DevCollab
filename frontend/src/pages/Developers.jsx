import { useEffect, useState } from "react";
import { Github, Globe, MapPin, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/api";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Spinner";

export default function Developers() {
  const [developers, setDevelopers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get(`/auth/developers?search=${encodeURIComponent(search)}`);
        setDevelopers(response.data.developers || []);
      } catch { setDevelopers([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  return <div className="mx-auto max-w-5xl">
    <PageHeader title="Developers" subtitle="Discover people building interesting projects in the DevCollab community." />
    <div className="relative mb-6"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, bio, or GitHub username" aria-label="Search developers" />
    </div>
    {loading ? <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div> : developers.length === 0 ? <EmptyState icon={Users} title="No developers found" description="Try a different name, bio, or GitHub username." /> :
      <div className="grid gap-4 md:grid-cols-2">{developers.map((developer) => <Link key={developer.id} to={`/developers/${developer.id}`} className="card card-hover block p-5">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-base font-semibold text-white">{developer.name?.charAt(0)?.toUpperCase() || "D"}</span><div><h2 className="font-semibold text-ink">{developer.name}</h2><p className="text-sm text-ink-muted">{developer.project_count} {developer.project_count === 1 ? "project" : "projects"}</p></div></div>
        {developer.bio && <p className="mt-4 line-clamp-2 text-sm text-ink-soft">{developer.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-ink-muted">{developer.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{developer.location}</span>}{developer.github_username && <a className="inline-flex items-center gap-1 hover:text-brand-soft" href={`https://github.com/${developer.github_username}`} target="_blank" rel="noreferrer"><Github className="h-4 w-4" />GitHub</a>}{developer.website && <a className="inline-flex items-center gap-1 hover:text-brand-soft" href={developer.website} target="_blank" rel="noreferrer"><Globe className="h-4 w-4" />Website</a>}</div>
      </Link>)}</div>}
  </div>;
}
