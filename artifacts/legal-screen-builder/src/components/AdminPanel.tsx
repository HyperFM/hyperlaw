import React, { useState, useEffect, useCallback } from "react";
import {
  Users, MessageSquare, X, Send, Clock, Infinity, ChevronLeft,
  RefreshCw, Shield, Calendar, Mail, Search, BarChart2, Zap, Copy, Check,
} from "lucide-react";
import { api, ClerkUser, ChatSession, ChatMessage } from "../lib/api";
import { aiApi, AiLog, AiStats, formatMicroUsd, featureLabel } from "../lib/aiApi";

const ORANGE = "#d9711f";
const DIM = "#666";
const LINE = "#1e1e1e";

type AdminView = "users" | "chat" | "ai";

interface AdminPanelProps { onClose: () => void }

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [view, setView] = useState<AdminView>("users");

  // ── Users / Chat state ───────────────────────────────────────────────────────
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ClerkUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── AI Inspector state ───────────────────────────────────────────────────────
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPage, setAiPage] = useState(1);
  const [aiTotal, setAiTotal] = useState(0);
  const [copied, setCopied] = useState(false);
  const AI_PAGE_SIZE = 50;

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

  const loadAiData = useCallback(async (page = 1) => {
    setAiLoading(true);
    try {
      const [logsResp, stats] = await Promise.all([
        aiApi.admin.logs({ page, limit: AI_PAGE_SIZE }),
        aiStats === null ? aiApi.admin.stats() : Promise.resolve(aiStats),
      ]);
      setAiLogs(logsResp.logs);
      setAiTotal(logsResp.total);
      setAiPage(logsResp.page);
      if (stats && "totalCalls" in stats) setAiStats(stats as AiStats);
    } catch {
    } finally {
      setAiLoading(false);
    }
  }, [aiStats]);

  useEffect(() => {
    if (view === "ai" && aiLogs.length === 0 && !aiLoading) {
      loadAiData(1);
    }
  }, [view, aiLogs.length, aiLoading, loadAiData]);

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

  const filteredUsers = users.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = userDisplayName(u).toLowerCase();
    const email = (u.email_addresses?.[0]?.email_address ?? "").toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  // Copy logs as TSV (easy to paste into Google Sheets)
  function copyLogs() {
    const header = ["Timestamp", "Feature", "Model", "Input Tokens", "Output Tokens", "Cost", "Response (ms)", "Cache Hit", "User ID"].join("\t");
    const rows = aiLogs.map(l => [
      new Date(l.createdAt).toISOString(),
      featureLabel(l.feature),
      l.model,
      l.inputTokens,
      l.outputTokens,
      formatMicroUsd(l.estimatedCostMicroUsd),
      l.responseTimeMs,
      l.cacheHit ? "Yes" : "No",
      l.userId,
    ].join("\t"));
    navigator.clipboard.writeText([header, ...rows].join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  const tabs: { id: AdminView; icon: React.ElementType; label: string }[] = [
    { id: "users", icon: Users, label: "Users" },
    { id: "ai", icon: Zap, label: "AI Inspector" },
  ];

  return (
    <div style={{
      background: "#0d0d0d", border: `1px solid ${LINE}`, borderRadius: 16,
      overflow: "hidden", marginTop: 16, marginBottom: 20,
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: `1px solid ${LINE}`,
        background: `${ORANGE}0d`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={15} color={ORANGE} />
          <span style={{ fontWeight: 800, fontSize: 14, color: ORANGE, letterSpacing: "0.04em" }}>
            Admin Panel
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => view === "ai" ? loadAiData(aiPage) : loadUsers()}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 5, display: "flex" }}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 5, display: "flex" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Tab nav ── */}
      {view !== "chat" && (
        <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button key={tab.id} onClick={() => setView(tab.id)} style={{
                flex: 1, background: "none", border: "none",
                borderBottom: active ? `2px solid ${ORANGE}` : "2px solid transparent",
                padding: "10px 12px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                color: active ? ORANGE : "#555", fontSize: 12, fontWeight: 700,
                transition: "color 0.15s",
              }}>
                <Icon size={12} /> {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Users view ── */}
      {view === "users" && (
        <div>
          <div style={{
            padding: "12px 16px 10px",
            borderBottom: `1px solid ${LINE}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 12 }}>
              <Users size={12} />
              <span>{users.length} user{users.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {users.length > 0 && (
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#444", pointerEvents: "none" }} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "#111", border: "1px solid #222",
                    borderRadius: 8, padding: "8px 10px 8px 28px",
                    color: "#ccc", fontSize: 12, outline: "none",
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading users…</div>
            ) : users.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>No users yet.</div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>No results for "{searchQuery}"</div>
            ) : (
              filteredUsers.map(user => {
                const email = user.email_addresses?.[0]?.email_address ?? "";
                const name = userDisplayName(user);
                const hasSession = !!sessions[user.id];
                return (
                  <div key={user.id} style={{
                    padding: "11px 16px", borderBottom: "1px solid #0e0e0e",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 17,
                      background: `${ORANGE}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 13, fontWeight: 800, color: ORANGE,
                    }}>
                      {name.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc", marginBottom: 2 }}>{name}</div>
                      <div style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
                        <Mail size={9} /> {email}
                      </div>
                      <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={9} />
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
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
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
        </div>
      )}

      {/* ── Chat view ── */}
      {view === "chat" && activeSession && (
        <div>
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${LINE}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <button onClick={() => setView("users")} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex" }}>
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
                    maxWidth: "75%", padding: "9px 12px",
                    borderRadius: msg.fromAdmin ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
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

          <div style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, display: "flex", gap: 8 }}>
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
                cursor: msgInput.trim() ? "pointer" : "not-allowed",
                color: msgInput.trim() ? "#000" : "#444",
                display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12,
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── AI Inspector view ── */}
      {view === "ai" && (
        <div>
          {/* Stats strip */}
          {aiStats && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0, borderBottom: `1px solid ${LINE}`,
            }}>
              {[
                { label: "Total Calls", value: aiStats.totalCalls.toLocaleString() },
                { label: "Total Cost", value: formatMicroUsd(aiStats.totalCostMicroUsd) },
                { label: "Cache Rate", value: `${aiStats.cacheHitRate}%` },
                { label: "Cached Entries", value: aiStats.cachedEntries.toLocaleString() },
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: "10px 12px",
                  borderRight: i < 3 ? `1px solid ${LINE}` : "none",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: ORANGE, letterSpacing: "-0.02em" }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Feature breakdown */}
          {aiStats && aiStats.byFeature.length > 0 && (
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>COST BY FEATURE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {aiStats.byFeature.map((f, i) => {
                  const pct = aiStats.totalCostMicroUsd > 0
                    ? Math.round((f.costMicroUsd / aiStats.totalCostMicroUsd) * 100)
                    : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 90, fontSize: 11, color: "#aaa", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {featureLabel(f.feature)}
                      </div>
                      <div style={{ flex: 1, height: 5, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#666", width: 50, textAlign: "right", flexShrink: 0 }}>
                        {formatMicroUsd(f.costMicroUsd)}
                      </div>
                      <div style={{ fontSize: 10, color: "#444", width: 32, textAlign: "right", flexShrink: 0 }}>
                        {f.calls}×
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Logs table */}
          <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5 }}>
              CALL LOG · {aiTotal.toLocaleString()} total
            </div>
            <button
              onClick={copyLogs}
              style={{
                background: copied ? "#1a2a1a" : "#111",
                border: `1px solid ${copied ? "#2a5a2a" : "#2a2a2a"}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: copied ? "#22c55e" : "#666", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
              }}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? "Copied!" : "Copy TSV"}
            </button>
          </div>

          {aiLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading AI logs…</div>
          ) : aiLogs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>
              No AI calls logged yet.<br />
              <span style={{ fontSize: 11, color: "#3a3a3a" }}>Calls appear here once users interact with Claude.</span>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", maxHeight: 320 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                      {["Time", "Feature", "Tokens In/Out", "Cost", "ms", "Cache"].map((h, i) => (
                        <th key={i} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 700, fontSize: 10, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: `1px solid #0e0e0e`, background: i % 2 === 0 ? "transparent" : "#050505" }}>
                        <td style={{ padding: "7px 10px", color: "#555", whiteSpace: "nowrap" }}>
                          {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#aaa", whiteSpace: "nowrap" }}>
                          {featureLabel(log.feature)}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#777", whiteSpace: "nowrap" }}>
                          {log.cacheHit ? (
                            <span style={{ color: "#444" }}>—</span>
                          ) : (
                            <>{log.inputTokens.toLocaleString()} / {log.outputTokens.toLocaleString()}</>
                          )}
                        </td>
                        <td style={{ padding: "7px 10px", color: log.cacheHit ? "#3a3a3a" : ORANGE, fontWeight: log.cacheHit ? 400 : 700, whiteSpace: "nowrap" }}>
                          {log.cacheHit ? "$0.0000" : formatMicroUsd(log.estimatedCostMicroUsd)}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#555", whiteSpace: "nowrap" }}>
                          {log.cacheHit ? "—" : `${log.responseTimeMs}`}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          {log.cacheHit ? (
                            <span style={{ fontSize: 10, background: "#1a2a1a", color: "#22c55e", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>HIT</span>
                          ) : (
                            <span style={{ fontSize: 10, background: "#1a1a2a", color: "#3b82f6", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>LIVE</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {aiTotal > AI_PAGE_SIZE && (
                <div style={{ padding: "8px 14px", borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>
                    Page {aiPage} of {Math.ceil(aiTotal / AI_PAGE_SIZE)}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { const p = aiPage - 1; setAiPage(p); loadAiData(p); }}
                      disabled={aiPage <= 1}
                      style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: aiPage <= 1 ? "#333" : "#888", cursor: aiPage <= 1 ? "not-allowed" : "pointer" }}
                    >← Prev</button>
                    <button
                      onClick={() => { const p = aiPage + 1; setAiPage(p); loadAiData(p); }}
                      disabled={aiPage >= Math.ceil(aiTotal / AI_PAGE_SIZE)}
                      style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: aiPage >= Math.ceil(aiTotal / AI_PAGE_SIZE) ? "#333" : "#888", cursor: aiPage >= Math.ceil(aiTotal / AI_PAGE_SIZE) ? "not-allowed" : "pointer" }}
                    >Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
