import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import api from "../api/api";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { Spinner } from "./ui/Spinner";

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      setRequests(res.data.data?.requests || []);
    } catch {
      /* transient errors are fine; dropdown just stays empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchRequests();
  }, [open]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pending = requests.filter((r) => r.status === "pending").length;

  const respond = async (r, action) => {
    setBusy(`${r.type}-${r.id}`);
    try {
      await api.post(`/contact-requests/${r.id}/${action}`);
      setRequests((prev) => prev.filter((x) => !(x.type === r.type && x.id === r.id)));
    } catch {
      /* leave it visible on failure */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative hidden rounded-lg p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink sm:inline-flex"
      >
        <Bell className="h-5 w-5" />
        {pending > 0 && (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-merge shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              Notifications
            </p>
            <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-6">
                <Spinner />
              </div>
            ) : requests.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-muted">No notifications yet.</p>
            ) : (
              requests.map((r) => (
                <div key={`${r.type}-${r.id}`} className="flex gap-3 border-b border-line/60 px-4 py-3">
                  <Avatar name={r.sender_name} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      {r.sender_name}
                      <span className="text-ink-muted">
                        {" "}sent you a {r.type === "contact" ? "contact" : "collaboration"} request
                      </span>
                    </p>
                    {r.message && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{r.message}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {r.type === "collab" && r.project_title && (
                        <Link
                          to={`/projects/${r.project_id}`}
                          onClick={() => setOpen(false)}
                          className="font-mono text-[0.6875rem] text-merge hover:underline"
                        >
                          {r.project_title}
                        </Link>
                      )}
                      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-muted">
                        {relativeTime(r.created_at)}
                      </span>
                    </div>
                    {r.status === "pending" && r.type === "contact" && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => respond(r, "accept")}
                          loading={busy === `${r.type}-${r.id}`}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => respond(r, "reject")}
                          disabled={busy === `${r.type}-${r.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  {r.status === "pending" && r.type !== "contact" && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-merge" title="Pending" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}