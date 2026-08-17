import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";

export default function Chats() {
  const { user } = useAuth();
  const toast = useToast();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const threadRef = useRef(null);
  const pollRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const res = await api.get("/chats");
    setConversations(res.data.data?.conversations || []);
  }, []);

  const loadMessages = useCallback(async (id) => {
    const res = await api.get(`/chats/${id}/messages`);
    setMessages(res.data.data?.messages || []);
  }, []);

  const openChat = async (conv) => {
    setActive(conv);
    await loadMessages(conv.id);
  };

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
  }, [loadConversations]);

  // Poll for new messages while a conversation is open.
  useEffect(() => {
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(async () => {
      const res = await api.get(`/chats/${active.id}/messages`).catch(() => null);
      if (res) setMessages(res.data.data?.messages || []);
    }, 3000);
    return () => {
      clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTo({ top: threadRef.current.scrollHeight });
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      const res = await api.post(`/chats/${active.id}/messages`, { body });
      setMessages((prev) => [...prev, res.data.data.message]);
      setDraft("");
      await loadConversations();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <FullPageLoader label="Loading chats…" />;

  return (
    <PageShell
      eyebrow="inbox"
      title="Chats"
      subtitle="Message developers whose contact requests you've accepted."
    >
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="surface h-fit p-3">
          {conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">
              No conversations yet. Send someone a contact request; once they accept, you can
              chat here.
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openChat(c)}
                  className={[
                    "flex w-full items-center gap-3 rounded-lg p-3 text-left transition",
                    active?.id === c.id ? "bg-surface-2" : "hover:bg-surface-2/60",
                  ].join(" ")}
                >
                  <Avatar name={c.other_name} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{c.other_name}</p>
                      {Number(c.unread) > 0 && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-merge" title="Unread" />
                      )}
                    </div>
                    {c.last_message && (
                      <p className="truncate text-xs text-ink-muted">{c.last_message}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="surface flex min-h-[26rem] flex-col overflow-hidden">
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <Avatar name={active.other_name} className="h-9 w-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{active.other_name}</p>
                  {user && (
                    <p className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-muted">
                      chatting as {user.name}
                    </p>
                  )}
                </div>
              </div>
              <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-ink-muted">
                    No messages yet. Send the first one!
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={[
                            "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                            mine ? "bg-merge/15 text-ink" : "bg-surface-2 text-ink",
                          ].join(" ")}
                        >
                          <p className="mb-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-ink-muted">
                            {mine ? `You (${user?.name || ""})` : active.other_name}
                          </p>
                          <p>{m.body}</p>
                          <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-wider text-ink-muted">
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
                <input
                  className="field flex-1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  aria-label="Message"
                />
                <Button type="submit" loading={sending} disabled={!draft.trim()}>
                  <Send className="h-4 w-4" /> Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <MessageSquare className="h-8 w-8 text-ink-muted" />
              <p className="text-sm text-ink-muted">Select a conversation to start messaging.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}