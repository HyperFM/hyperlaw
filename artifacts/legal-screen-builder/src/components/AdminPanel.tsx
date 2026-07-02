import React, { useState, useEffect, useCallback } from "react";
import {
  Users, MessageSquare, X, Send, Clock, Infinity, ChevronLeft,
  ChevronRight, RefreshCw, Shield, Calendar, Mail,
} from "lucide-react";
import { api, ClerkUser, ChatSession, ChatMessage } from "../lib/api";

const ORANGE = "#d9711f";

type AdminView = "users" | "chat";

interface AdminPanelProps { onClose: () => void }

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [view, setView] = useState<AdminView>("users");
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ClerkUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [userList, chatSessions] = await Promise.all([
        api.admin.users(),
        api.admin.chatSessions(),
      ]);
      setUsers(Array.isArray(userList) ? userList : []);
      const sessionMap: Record<string, ChatSession> = {};
      chatSessions.forEach(s => { sessionMap[s.userId] = s; });
      setSessions(sessionMap);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await api.admin.getMessages(sessionId);
      setMessages(msgs);
    } catch {}
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    loadMessages(activeSession.id);
    const iv = setInterval(() => loadMessages(activeSession.id), 8000);
    return () => clearInterval(iv);
  }, [activeSession, loadMessages]);

  async function openChatWithUser(user: ClerkUser) {
    const email = user.email_addresses?.[0]?.email_address ?? "";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    try {
      const session = sessions[user.id]
        ?? await api.admin.openChat(user.id, email, name);
      setActiveSession(session);
      setSessions(prev => ({ ...prev, [user.id]: session }));
      setSelectedUser(user);
      setView("chat");
    } catch {}
  }

  async function sendMessage() {
    if (!activeSession || !msgInput.trim()) return;
    setSendingMsg(true);
    try {
      const msg = await api.admin.sendMessage(activeSession.id, msgInput.trim());
      setMessages(prev => [...prev, msg]);
      setMsgInput("");
    } catch {
    } finally {
      setSendingMsg(false);
    }
  }

  async function updateRetention(status: string, retentionDays: number | null) {
    if (!activeSession) return;
    try {
      const updated = await api.admin.updateRetention(activeSession.id, status, retentionDays);
      setActiveSession(updated);
    } catch {}
  }

  function userDisplayName(u: ClerkUser) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return name || u.email_addresses?.[0]?.email_address || u.id.slice(0, 12);
  }

  return (
    <div style={{
      background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 16,
      overflow: "hidden", marginBottom: 20,
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #1a1a1a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `${ORANGE}10`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={15} color={ORANGE} />
          <span style={{ fontWeight: 800, fontSize: 14, color: ORANGE }}>Admin Panel</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setView("users")}
            style={{
              background: view === "users" ? `${ORANGE}22` : "none",
              border: `1px solid ${view === "users" ? ORANGE + "55" : "#2a2a2a"}`,
              borderRadius: 8, padding: "5px 10px", cursor: "pointer",
              color: view === "users" ? ORANGE : "#555", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Users size={12} /> Users
          </button>
          <button onClick={loadUsers} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 5 }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {view === "users" && (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>Loading users…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>No users yet.</div>
          ) : (
            users.map(user => {
              const email = user.email_addresses?.[0]?.email_address ?? "";
              const name = userDisplayName(user);
              const hasSession = !!sessions[user.id];
              return (
                <div key={user.id} style={{
                  padding: "12px 16px", borderBottom: "1px solid #111",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18, background: ORANGE + "22",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontSize: 14, fontWeight: 800, color: ORANGE,
                  }}>
                    {name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
                      <Mail size={10} /> {email}
                    </div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <Calendar size={10} />
                      {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <button
                    onClick={() => openChatWithUser(user)}
                    style={{
                      background: hasSession ? `${ORANGE}18` : "#111",
                      border: `1px solid ${hasSession ? ORANGE + "44" : "#2a2a2a"}`,
                      borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                      color: hasSession ? ORANGE : "#666",
                      fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <MessageSquare size={11} />
                    {hasSession ? "Chat" : "Open"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {view === "chat" && activeSession && (
        <div>
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid #111",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <button onClick={() => setView("users")} style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{selectedUser ? userDisplayName(selectedUser) : "User"}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{activeSession.userEmail}</div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#555" }}>Retention:</span>
              {[
                { label: "Perm.", status: "permanent", days: null },
                { label: "30d", status: "temporary", days: 30 },
                { label: "7d", status: "temporary", days: 7 },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => updateRetention(opt.status, opt.days)}
                  style={{
                    background: activeSession.status === opt.status && activeSession.retentionDays === opt.days
                      ? `${ORANGE}22` : "#111",
                    border: `1px solid ${activeSession.status === opt.status && activeSession.retentionDays === opt.days ? ORANGE + "44" : "#2a2a2a"}`,
                    borderRadius: 6, padding: "3px 7px", cursor: "pointer",
                    fontSize: 10, fontWeight: 700,
                    color: activeSession.status === opt.status && activeSession.retentionDays === opt.days ? ORANGE : "#555",
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >
                  {opt.status === "permanent" ? <Infinity size={9} /> : <Clock size={9} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 240, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "#444", fontSize: 13, paddingTop: 60 }}>
                No messages yet. Start the conversation.
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} style={{ display: "flex", justifyContent: msg.fromAdmin ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "75%", padding: "9px 12px", borderRadius: msg.fromAdmin ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.fromAdmin ? ORANGE : "#1a1a1a",
                    color: msg.fromAdmin ? "#000" : "#ccc",
                    fontSize: 13, lineHeight: 1.45,
                  }}>
                    <div>{msg.body}</div>
                    <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>
                      {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: "10px 14px", borderTop: "1px solid #111", display: "flex", gap: 8 }}>
            <input
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Type a message…"
              style={{
                flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 10,
                padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!msgInput.trim() || sendingMsg}
              style={{
                background: msgInput.trim() ? ORANGE : "#1a1a1a",
                border: "none", borderRadius: 10, padding: "9px 14px",
                cursor: msgInput.trim() ? "pointer" : "not-allowed", color: msgInput.trim() ? "#000" : "#444",
                display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12,
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
