import React, { useState, useEffect } from "react";
import { X, Send, CheckCircle, MessageSquare, Lightbulb, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { api, type FeedbackItem } from "../lib/api";
import { useAuth } from "../lib/auth";

const ORANGE = "#d9711f";

const TYPES = [
  { id: "improvement", label: "Improvement idea", icon: Lightbulb },
  { id: "support", label: "Need assistance", icon: HelpCircle },
  { id: "general", label: "General feedback", icon: MessageSquare },
];

interface SupportModalProps { onClose: () => void }

export default function SupportModal({ onClose }: SupportModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.feedback.submit(message.trim(), type);
      setSent(true);
      setTimeout(() => handleClose(), 2200);
    } catch {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400, display: "flex",
      alignItems: "flex-end", justifyContent: "center",
      background: `rgba(0,0,0,${visible ? 0.85 : 0})`,
      transition: "background 0.28s ease",
    }}>
      <div onClick={handleClose} style={{ position: "absolute", inset: 0 }} />
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 560,
        background: "#0f0f0f", border: "1px solid #1e1e1e",
        borderRadius: "20px 20px 0 0",
        transform: `translateY(${visible ? 0 : "100%"})`,
        transition: "transform 0.32s cubic-bezier(.22,.9,.32,1)",
        paddingBottom: "env(safe-area-inset-bottom)",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={16} color={ORANGE} />
            <span style={{ fontWeight: 800, fontSize: 15 }}>Support & Feedback</span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {isAdmin ? (
          <AdminFeedbackInbox type={type} setType={setType} />
        ) : sent ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <CheckCircle size={48} color="#22c55e" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Received!</div>
            <div style={{ color: "#666", fontSize: 14 }}>We'll be in touch via your notifications.</div>
          </div>
        ) : (
          <div style={{ padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>WHAT IS THIS ABOUT?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    style={{
                      flex: 1, background: type === t.id ? `${ORANGE}18` : "#111",
                      border: `1px solid ${type === t.id ? ORANGE + "55" : "#2a2a2a"}`,
                      borderRadius: 10, padding: "10px 8px", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    }}
                  >
                    <Icon size={15} color={type === t.id ? ORANGE : "#555"} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: type === t.id ? ORANGE : "#555", textAlign: "center", lineHeight: 1.2 }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>YOUR MESSAGE</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind — improvement ideas, something confusing, or anything you need help with…"
              rows={5}
              style={{
                width: "100%", background: "#111", border: "1px solid #2a2a2a",
                borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14,
                outline: "none", resize: "none", boxSizing: "border-box",
                fontFamily: "Arial, sans-serif", lineHeight: 1.55,
              }}
              onFocus={e => (e.target.style.borderColor = ORANGE)}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />

            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              style={{
                width: "100%", marginTop: 14, padding: "13px",
                background: message.trim() && !sending ? ORANGE : "#1a1a1a",
                border: "none", borderRadius: 12, color: message.trim() && !sending ? "#000" : "#444",
                fontWeight: 800, fontSize: 14, cursor: message.trim() && !sending ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.15s",
              }}
            >
              <Send size={15} /> {sending ? "Sending…" : "Send Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Admin-only view: same three category icons (now with unread badges),
 *  but selecting one shows the list of submissions in that category —
 *  tap one to read it and reply. Real push-notification delivery to the
 *  original sender isn't wired up (needs Capacitor push-notifications +
 *  an Apple Push key + a backend sending service); replies land in that
 *  user's in-app notifications feed for now. */
function AdminFeedbackInbox({ type, setType }: { type: string; setType: (t: string) => void }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  async function refresh() {
    const [allItems, unread] = await Promise.all([api.feedback.listAll(), api.feedback.unreadCounts()]);
    setItems(allItems);
    setCounts(unread);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function handleExpand(item: FeedbackItem) {
    const opening = expandedId !== item.id;
    setExpandedId(opening ? item.id : null);
    setReplyText("");
    if (opening && !item.read) {
      await api.feedback.markRead(item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i));
      setCounts(prev => ({ ...prev, [item.type]: Math.max(0, (prev[item.type] ?? 0) - 1) }));
    }
  }

  async function handleReply(item: FeedbackItem) {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const updated = await api.feedback.reply(item.id, replyText.trim());
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      setReplyText("");
    } finally {
      setReplySending(false);
    }
  }

  const filtered = items.filter(i => i.type === type);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>WHAT IS THIS ABOUT?</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {TYPES.map(t => {
            const Icon = t.icon;
            const count = counts[t.id] ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => { setType(t.id); setExpandedId(null); }}
                style={{
                  flex: 1, position: "relative", background: type === t.id ? `${ORANGE}18` : "#111",
                  border: `1px solid ${type === t.id ? ORANGE + "55" : "#2a2a2a"}`,
                  borderRadius: 10, padding: "10px 8px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                }}
              >
                {count > 0 && (
                  <span style={{
                    position: "absolute", top: -6, right: -6, minWidth: 18, height: 18,
                    borderRadius: 9, background: ORANGE, color: "#000", fontSize: 10, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                  }}>
                    {count > 9 ? "9+" : count}
                  </span>
                )}
                <Icon size={15} color={type === t.id ? ORANGE : "#555"} />
                <span style={{ fontSize: 11, fontWeight: 700, color: type === t.id ? ORANGE : "#555", textAlign: "center", lineHeight: 1.2 }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#555", fontSize: 13, padding: "24px 0" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#444", fontSize: 13, padding: "24px 0" }}>Nothing here yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(item => {
              const open = expandedId === item.id;
              return (
                <div key={item.id} style={{ background: "#111", border: `1px solid ${item.read ? "#1e1e1e" : ORANGE + "55"}`, borderRadius: 12, overflow: "hidden" }}>
                  <button
                    onClick={() => handleExpand(item)}
                    style={{ width: "100%", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {!item.read && <span style={{ width: 7, height: 7, borderRadius: 4, background: ORANGE, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#eee" }}>
                        {item.userName || item.userEmail || "Anonymous"}
                      </div>
                      <div style={{ fontSize: 12, color: "#777", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.message}
                      </div>
                    </div>
                    {item.repliedAt && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", flexShrink: 0 }}>Replied</span>
                    )}
                    {open ? <ChevronUp size={14} color="#555" style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color="#555" style={{ flexShrink: 0 }} />}
                  </button>

                  {open && (
                    <div style={{ padding: "0 14px 14px" }}>
                      <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.55, paddingTop: 8, borderTop: "1px solid #1e1e1e", marginBottom: 10 }}>
                        {item.message}
                      </div>
                      {item.adminReply && (
                        <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", marginBottom: 3 }}>YOUR REPLY</div>
                          <div style={{ fontSize: 12.5, color: "#aaa", lineHeight: 1.5 }}>{item.adminReply}</div>
                        </div>
                      )}
                      <textarea
                        value={open ? replyText : ""}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Reply to this message…"
                        rows={3}
                        style={{
                          width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a",
                          borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
                          outline: "none", resize: "none", boxSizing: "border-box",
                          fontFamily: "Arial, sans-serif", lineHeight: 1.5, marginBottom: 8,
                        }}
                      />
                      <button
                        onClick={() => handleReply(item)}
                        disabled={!replyText.trim() || replySending}
                        style={{
                          width: "100%", padding: "10px", background: replyText.trim() && !replySending ? ORANGE : "#1a1a1a",
                          border: "none", borderRadius: 8, color: replyText.trim() && !replySending ? "#000" : "#444",
                          fontWeight: 800, fontSize: 13, cursor: replyText.trim() && !replySending ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <Send size={13} /> {replySending ? "Sending…" : "Send Reply"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
