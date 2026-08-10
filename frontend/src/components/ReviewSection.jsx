import React, { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { ThumbsUp, ThumbsDown, Reply, Send, Star, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./ui/Button";
import { useToast } from "./ui/Toast";

function buildReviewTree(flat) {
  const map = {};
  flat.forEach((r) => { map[r.id] = { ...r, replies: [] }; });
  const roots = [];
  flat.forEach((r) => {
    if (r.parent_review_id) map[r.parent_review_id]?.replies.push(map[r.id]);
    else roots.push(map[r.id]);
  });
  return roots;
}

function StarRating({ rating, size = "sm", interactive = false, onChange }) {
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        const active = hoverRating ? starValue <= hoverRating : starValue <= rating;
        return (
          <Star
            key={i}
            className={[
              size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5",
              active ? "fill-amber-500 text-amber-500" : "text-ink-muted/30",
              interactive ? "cursor-pointer transition hover:scale-110" : ""
            ].join(" ")}
            onClick={() => interactive && onChange?.(starValue)}
            onMouseEnter={() => interactive && setHoverRating(starValue)}
            onMouseLeave={() => interactive && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
}

function ReviewItem({ review, depth = 0, onReply, onReact }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const indent = Math.min(depth, 6) * 20;

  return (
    <div style={{ marginLeft: indent }} className="mt-4 animate-fade-in">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-semibold text-brand-soft uppercase">
              {review.reviewer_name?.charAt(0) || "?"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink">{review.reviewer_name}</p>
                {review.rating && <StarRating rating={review.rating} />}
              </div>
              <p className="text-xs text-ink-muted">
                {review.created_at
                  ? new Date(review.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : ""}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-2.5 whitespace-pre-line text-sm text-ink-soft">{review.content}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onReact(review.id, "like")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              review.my_reaction === "like" ? "border-brand/50 bg-brand/10 text-brand-soft" : "border-line text-ink-muted hover:bg-surface-2",
            ].join(" ")}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> {review.likes || 0}
          </button>

          <button
            onClick={() => onReact(review.id, "dislike")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              review.my_reaction === "dislike" ? "border-danger/50 bg-danger/10 text-danger" : "border-line text-ink-muted hover:bg-surface-2",
            ].join(" ")}
          >
            <ThumbsDown className="h-3.5 w-3.5" /> {review.dislikes || 0}
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
                if (e.key === "Enter" && replyText.trim()) { onReply(review.id, replyText); setReplyText(""); setShowReply(false); }
              }}
            />
            <Button size="sm" disabled={!replyText.trim()} onClick={() => { onReply(review.id, replyText); setReplyText(""); setShowReply(false); }}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {review.replies?.length > 0 && (
        <div className="mt-2">
          {review.replies.map((r) => (
            <ReviewItem key={r.id} review={r} depth={depth + 1} onReply={onReply} onReact={onReact} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewSection({ projectId }) {
  const [flatReviews, setFlatReviews] = useState([]);
  const [newReview, setNewReview] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reviewCount, setReviewCount] = useState(0);
  const toast = useToast();

  const tree = useMemo(() => buildReviewTree(flatReviews), [flatReviews]);

  const fetchReviews = async (p) => {
    try {
      const res = await api.get(`/reviews/project/${projectId}?page=${p}&limit=10`);
      setFlatReviews(res.data.reviews || []);
      setTotalPages(res.data.totalPages || 1);
      setReviewCount(res.data.reviewCount || 0);
    } catch {
      setFlatReviews([]);
      setTotalPages(1);
    }
  };

  // The fetch function is intentionally recreated with the current project id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); fetchReviews(1); }, [projectId]);

  const handleAddReview = async () => {
    if (!newReview.trim()) return;
    setLoading(true);
    try {
      await api.post(`/reviews/project/${projectId}`, { content: newReview.trim(), rating });
      setNewReview("");
      setRating(5);
      await fetchReviews(page);
      toast.success("Review posted successfully.");
    } catch {
      toast.error("Failed to post review.");
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (reviewId, content) => {
    if (!content?.trim()) return;
    try {
      await api.post(`/reviews/${reviewId}/reply`, { content: content.trim() });
      await fetchReviews(page);
    } catch {
      toast.error("Failed to post reply.");
    }
  };

  const handleReact = async (reviewId, type) => {
    try {
      await api.post(`/reviews/${reviewId}/react`, { type });
      await fetchReviews(page);
    } catch {
      toast.error("Failed to react.");
    }
  };

  const goToPage = (p) => {
    setPage(p);
    fetchReviews(p);
  };

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-ink">
        Reviews & Code Feedback
        {reviewCount > 0 && <span className="ml-2 text-sm font-normal text-ink-muted">{reviewCount}</span>}
      </h2>

      <div className="mb-6 card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-soft">Your Rating:</span>
          <StarRating rating={rating} size="lg" interactive={true} onChange={setRating} />
        </div>

        <div className="flex gap-2">
          <input
            value={newReview}
            onChange={(e) => setNewReview(e.target.value)}
            placeholder="Add a review or code feedback…"
            className="field"
            onKeyDown={(e) => e.key === "Enter" && handleAddReview()}
          />
          <Button onClick={handleAddReview} loading={loading}>
            <Send className="h-4 w-4" /> Review
          </Button>
        </div>
      </div>

      {tree.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-muted">
          No reviews yet. Be the first to provide feedback on this project!
        </p>
      ) : (
        <>
          {tree.map((r) => <ReviewItem key={r.id} review={r} depth={0} onReply={handleReply} onReact={handleReact} />)}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-ink-muted">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => goToPage(page + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
