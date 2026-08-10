import React, { useState, useEffect, useCallback } from "react";
import { Bell, X, Check, MessageSquare, Star, AlertCircle, Clock } from "lucide-react";
import { api, AppNotification } from "../lib/api";

const ORANGE = "#d9711f";

function typeIcon(type: string) {
  if (type === "admin_message") return <MessageSquare size={14} color={ORANGE} />;
  if (type === "case_expiring") return <Clock size={14} color="#ef4444" />;
  if (type === "system") return <Star size={14} color="#3b82f6" />;
  return <AlertCircle size={14} color="#555" />;
}

interface NotificationBellProps {
  onOpenChat?: (sessionId: string) => void;
  /** Navigate into the given case and reset its 60-day retention clock */
  onExtendCase?: (caseId: string) => void;
  /** Navigate to the Profile tab so the user can delete the case themselves */
  onGoToProfile?: () => void;
}

export default function NotificationBell({ onOpenChat, onExtendCase, onGoToProfile }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [expiringPrompt, setExpiringPrompt] = useState<AppNotification | null>(null);
  const [muting, setMuting] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.notifications.list();
      setNotifications(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  async function markRead(id: string) {
    await api.notifications.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await api.notifications.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function handleNotifClick(n: AppNotification) {
    markRead(n.id);
    if (n.type === "case_expiring" && n.metadata?.caseId) {
      setExpiringPrompt(n);
      return;
    }
    if (n.type === "admin_message" && n.metadata?.sessionId && onOpenChat) {
      onOpenChat(n.metadata.sessionId as string);
      setOpen(false);
    }
  }

  async function handleMuteCase() {
    const caseId = expiringPrompt?.metadata?.caseId as string | undefined;
    if (!caseId) return;
    setMuting(true);
    try {
      await api.cases.muteExpiryWarning(caseId);
    } catch {
    } finally {
      setMuting(false);
      setExpiringPrompt(null);
      setOpen(false);
    }
  }

  function handleExtendCase() {
    const caseId = expiringPrompt?.metadata?.caseId as string | undefined;
    setExpiringPrompt(null);
    setOpen(false);
    if (caseId) {
      api.cases.touch(caseId).catch(() => {});
      onExtendCase?.(caseId);
    }
  }

  function handleGoDeleteCase() {
    setExpiringPrompt(null);
    setOpen(false);
    onGoToProfile?.();
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "relative", background: "none", border: "none", cursor: "pointer",
          color: unread > 0 ? ORANGE : "#555", padding: 8, display: "flex",
          alignItems: "center", justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8,
            background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500, display: "flex",
          flexDirection: "column", alignItems: "flex-end",
        }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div style={{
            position: "relative", zIndex: 1, background: "#0f0f0f",
            border: "1px solid #1e1e1e", borderRadius: "0 0 0 16px",
            width: "min(360px, 100vw)", maxHeight: "70vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          }}>
            <div style={{
              padding: "14px 16px", borderBottom: "1px solid #1a1a1a",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell size={15} color={ORANGE} />
                <span style={{ fontWeight: 800, fontSize: 14 }}>Notifications</span>
                {unread > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 99 }}>
                    {unread}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {unread > 0 && (
                  <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", color: ORANGE, fontSize: 11, fontWeight: 700, padding: "4px 8px" }}>
                    <Check size={12} style={{ marginRight: 3, display: "inline" }} />
                    All read
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && notifications.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading…</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  <Bell size={32} color="#1e1e1e" style={{ marginBottom: 10 }} />
                  <div style={{ color: "#444", fontSize: 14 }}>No notifications yet</div>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    style={{
                      width: "100%", background: n.read ? "transparent" : `${ORANGE}08`,
                      border: "none", borderBottom: "1px solid #111", padding: "13px 16px",
                      cursor: "pointer", textAlign: "left", display: "flex", gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 2 }}>{typeIcon(n.type)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: n.read ? 600 : 800, fontSize: 13, color: n.read ? "#888" : "#fff", marginBottom: 2 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {!n.read && (
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE, flexShrink: 0, marginTop: 4 }} />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {expiringPrompt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={() => setExpiringPrompt(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
          <div style={{
            position: "relative", zIndex: 1, background: "#111", border: "1px solid #222",
            borderRadius: 16, width: "min(360px, 100%)", padding: 20,
            boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Clock size={16} color="#ef4444" />
              <span style={{ fontWeight: 800, fontSize: 14 }}>{expiringPrompt.title}</span>
            </div>
            <div style={{ fontSize: 13, color: "#999", lineHeight: 1.5, marginBottom: 18 }}>{expiringPrompt.body}</div>

            <button
              onClick={handleExtendCase}
              style={{ width: "100%", background: ORANGE, color: "#000", border: "none", borderRadius: 10, padding: "12px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>
              Keep this case — extend 60 more days
            </button>
            <button
              onClick={handleGoDeleteCase}
              style={{ width: "100%", background: "#1a1a1a", color: "#ddd", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              Delete this case in Profile
            </button>
            <button
              onClick={handleMuteCase}
              disabled={muting}
              style={{ width: "100%", background: "none", color: "#666", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600, cursor: muting ? "default" : "pointer" }}>
              {muting ? "Stopping…" : "I'm done with this case — stop notifying me"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
