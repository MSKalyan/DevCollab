import React, { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { ThumbsUp, ThumbsDown, Reply, Send } from "lucide-react";
import Button from "./ui/Button";
import { useToast } from "./ui/Toast";

function buildCommentTree(flat) {
  const map = {};
  flat.forEach((c) => { map[c.id] = { ...c, replies: [] }; });
  const roots = [];
  flat.forEach((c) => {
    if (c.parent_comment_id) map[c.parent_comment_id]?.replies.push(map[c.id]);
    else roots.push(map[c.id]);
  });
  return roots;
}

function CommentItem({ comment, depth = 0, onReply, onReact }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const indent = Math.min(depth, 6) * 20;

  return (
    <div style={{ marginLeft: indent }} className="mt-4 animate-fade-in">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-semibold text-brand-soft">
            {comment.author_name?.charAt(0)?.toUpperCase() || "?"}
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{comment.author_name}</p>
            <p className="text-xs text-ink-muted">
              {comment.created_at
                ? new Date(comment.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                : ""}
            </p>
          </div>
        </div>

        <p className="mt-2.5 whitespace-pre-line text-sm text-ink-soft">{comment.content}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onReact(comment.id, "like")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              comment.my_reaction === "like" ? "border-brand/50 bg-brand/10 text-brand-soft" : "border-line text-ink-muted hover:bg-surface-2",
            ].join(" ")}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> {comment.likes || 0}
          </button>

          <button
            onClick={() => onReact(comment.id, "dislike")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              comment.my_reaction === "dislike" ? "border-danger/50 bg-danger/10 text-danger" : "border-line text-ink-muted hover:bg-surface-2",
            ].join(" ")}
          >
            <ThumbsDown className="h-3.5 w-3.5" /> {comment.dislikes || 0}
          </button>

          <button
            onClick={() => setShowReply((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-soft transition hover:bg-brand/10"
          >
            <Reply className="h-3.5 w-3.5" /> Reply
          </button>
        </div>

        {showReply && (
          <div className="mt-3 flex gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply…"
              className="field"
              onKeyDown={(e) => {
                if (e.key === "Enter" && replyText.trim()) { onReply(comment.id, replyText); setReplyText(""); setShowReply(false); }
              }}
            />
            <Button size="sm" disabled={!replyText.trim()} onClick={() => { onReply(comment.id, replyText); setReplyText(""); setShowReply(false); }}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {comment.replies?.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} depth={depth + 1} onReply={onReply} onReact={onReact} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentSection({ blogId }) {
  const [flatComments, setFlatComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const tree = useMemo(() => buildCommentTree(flatComments), [flatComments]);

  const fetchComments = async () => {
    const res = await api.get(`/comments/blog/${blogId}`);
    setFlatComments(res.data.comments || []);
  };

  useEffect(() => { fetchComments(); /* eslint-disable-next-line */ }, [blogId]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      await api.post(`/comments/blog/${blogId}`, { content: newComment.trim() });
      setNewComment("");
      await fetchComments();
    } catch {
      toast.error("Failed to post comment.");
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (commentId, content) => {
    if (!content?.trim()) return;
    try {
      await api.post(`/comments/${commentId}/reply`, { content: content.trim() });
      await fetchComments();
    } catch {
      toast.error("Failed to post reply.");
    }
  };

  const handleReact = async (commentId, type) => {
    try {
      await api.post(`/comments/${commentId}/react`, { type });
      await fetchComments();
    } catch {
      toast.error("Failed to react.");
    }
  };

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-ink">
        Comments
        {flatComments.length > 0 && <span className="ml-2 text-sm font-normal text-ink-muted">{flatComments.length}</span>}
      </h2>

      <div className="mb-6 flex gap-2">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          className="field"
          onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
        />
        <Button onClick={handleAddComment} loading={loading}>
          <Send className="h-4 w-4" /> Comment
        </Button>
      </div>

      {tree.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-muted">
          No comments yet. Be the first to share your thoughts.
        </p>
      ) : (
        tree.map((c) => <CommentItem key={c.id} comment={c} depth={0} onReply={handleReply} onReact={handleReact} />)
      )}
    </section>
  );
}
