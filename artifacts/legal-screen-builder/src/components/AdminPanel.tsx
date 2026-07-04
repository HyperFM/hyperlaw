import React, { useState, useEffect, useCallback } from "react";
import {
  Users, MessageSquare, X, Send, Clock, Infinity, ChevronLeft,
  RefreshCw, Shield, Calendar, Mail, Search, BarChart2, Zap, Copy, Check,
  BookOpen, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  DollarSign, FileText, Lock, Unlock, AlertCircle,
} from "lucide-react";
import { api, ClerkUser, ChatSession, ChatMessage } from "../lib/api";
import { aiApi, AiLog, AiStats, KnowledgeEntry, ErrorLog, formatMicroUsd, featureLabel } from "../lib/aiApi";

const ORANGE = "#d9711f";
const DIM = "#666";
const LINE = "#1e1e1e";

type AdminView = "users" | "chat" | "ai" | "knowledge" | "revenue" | "errors";

interface PlatformStats {
  totalUsers: number;
  totalDocs: number;
  unlockedDocs: number;
  previewDocs: number;
  creditsSold: number;
  stripeRevenueCents: number;
}

interface KbForm {
  id?: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tagsStr: string;       // comma-separated in the form
  keywordsStr: string;   // comma-separated in the form
  jurisdiction: string;
  source: string;
  isActive: boolean;
}

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

  // ── Knowledge Library state ───────────────────────────────────────────────
  const [kbEntries, setKbEntries] = useState<KnowledgeEntry[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSearch, setKbSearch] = useState("");
  const [kbForm, setKbForm] = useState<KbForm | null>(null);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbExpandedId, setKbExpandedId] = useState<string | null>(null);

  // ── Revenue / Platform stats state ───────────────────────────────────────
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // ── Error Logs state ──────────────────────────────────────────────────────
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsTotal, setErrorLogsTotal] = useState(0);
  const [errorLogsPage, setErrorLogsPage] = useState(1);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const ERROR_LOGS_PAGE_SIZE = 50;

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

  useEffect(() => {
    if (view === "errors" && errorLogs.length === 0 && !errorLogsLoading) {
      loadErrorLogs(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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

  const loadKbData = useCallback(async () => {
    setKbLoading(true);
    try {
      const entries = await aiApi.knowledge.list();
      setKbEntries(entries);
    } catch {
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "knowledge" && kbEntries.length === 0 && !kbLoading) {
      loadKbData();
    }
  }, [view, kbEntries.length, kbLoading, loadKbData]);

  const loadRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const stats = await aiApi.admin.platformStats();
      setPlatformStats(stats);
    } catch {
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "revenue" && !platformStats && !revenueLoading) {
      loadRevenue();
    }
  }, [view, platformStats, revenueLoading, loadRevenue]);

  function blankForm(): KbForm {
    return { title: "", summary: "", body: "", category: "other", tagsStr: "", keywordsStr: "", jurisdiction: "", source: "", isActive: true };
  }

  async function saveKbEntry() {
    if (!kbForm) return;
    if (!kbForm.title.trim() || !kbForm.summary.trim() || !kbForm.body.trim()) return;
    setKbSaving(true);
    const payload = {
      title: kbForm.title.trim(),
      summary: kbForm.summary.trim(),
      body: kbForm.body.trim(),
      category: kbForm.category,
      tags: kbForm.tagsStr.split(",").map(s => s.trim()).filter(Boolean),
      keywords: kbForm.keywordsStr.split(",").map(s => s.trim()).filter(Boolean),
      jurisdiction: kbForm.jurisdiction.trim() || null,
      source: kbForm.source.trim() || null,
      isActive: kbForm.isActive,
    };
    try {
      if (kbForm.id) {
        const updated = await aiApi.knowledge.update(kbForm.id, payload);
        setKbEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      } else {
        const created = await aiApi.knowledge.create(payload);
        setKbEntries(prev => [created, ...prev]);
      }
      setKbForm(null);
    } catch {
    } finally {
      setKbSaving(false);
    }
  }

  async function toggleKbActive(entry: KnowledgeEntry) {
    try {
      const updated = await aiApi.knowledge.update(entry.id, { isActive: !entry.isActive });
      setKbEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    } catch {}
  }

  async function deleteKbEntry(id: string) {
    if (!window.confirm("Delete this knowledge entry? This cannot be undone.")) return;
    try {
      await aiApi.knowledge.remove(id);
      setKbEntries(prev => prev.filter(e => e.id !== id));
      if (kbExpandedId === id) setKbExpandedId(null);
    } catch {}
  }

  function editEntry(entry: KnowledgeEntry) {
    setKbForm({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      body: entry.body,
      category: entry.category,
      tagsStr: entry.tags.join(", "),
      keywordsStr: entry.keywords.join(", "),
      jurisdiction: entry.jurisdiction ?? "",
      source: entry.source ?? "",
      isActive: entry.isActive,
    });
  }

  const CATEGORIES = ["employment", "police", "court", "federal", "other"];
  const CAT_COLORS: Record<string, string> = {
    employment: "#f59e0b", police: "#3b82f6", court: "#8b5cf6",
    federal: "#10b981", other: "#666",
  };

  const filteredKb = kbEntries.filter(e => {
    if (!kbSearch.trim()) return true;
    const q = kbSearch.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q) || e.category.includes(q);
  });

  const loadErrorLogs = useCallback(async (page = 1) => {
    setErrorLogsLoading(true);
    try {
      const resp = await aiApi.admin.errorLogs({ page, limit: ERROR_LOGS_PAGE_SIZE });
      setErrorLogs(resp.logs);
      setErrorLogsTotal(resp.total);
      setErrorLogsPage(resp.page);
    } catch {
    } finally {
      setErrorLogsLoading(false);
    }
  }, []);

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  const tabs: { id: AdminView; icon: React.ElementType; label: string }[] = [
    { id: "users", icon: Users, label: "Users" },
    { id: "ai", icon: Zap, label: "AI Inspector" },
    { id: "knowledge", icon: BookOpen, label: "Knowledge" },
    { id: "revenue", icon: DollarSign, label: "Revenue" },
    { id: "errors", icon: AlertCircle, label: "Errors" },
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
            onClick={() => view === "ai" ? loadAiData(aiPage) : view === "knowledge" ? loadKbData() : view === "revenue" ? loadRevenue() : view === "errors" ? loadErrorLogs(errorLogsPage) : loadUsers()}
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

          {/* Response time chart — last 14 days of live (non-cached) calls */}
          {aiStats && aiStats.dailyStats.length > 1 && (() => {
            const recent = aiStats.dailyStats.slice(-14);
            const maxMs = Math.max(...recent.map(d => d.avgResponseTimeMs), 1);
            return (
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
                  AVG RESPONSE TIME (ms) · LAST {recent.length} DAYS · Global avg: {aiStats.avgResponseTimeMs}ms
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 52 }}>
                  {recent.map((d, i) => (
                    <div key={i} title={`${d.day}: ${d.avgResponseTimeMs}ms`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, height: "100%", justifyContent: "flex-end" }}>
                      <div style={{
                        width: "100%", borderRadius: "2px 2px 0 0",
                        // 0ms = cache-only day, show as neutral stub; non-zero = live call data
                        background: d.avgResponseTimeMs === 0 ? "#1e1e1e" : d.avgResponseTimeMs > 3000 ? "#ef4444" : d.avgResponseTimeMs > 1500 ? ORANGE : "#22c55e",
                        height: d.avgResponseTimeMs === 0 ? "4px" : `${Math.max(4, Math.round((d.avgResponseTimeMs / maxMs) * 42))}px`,
                        opacity: d.avgResponseTimeMs === 0 ? 0.4 : 1,
                        transition: "height 0.3s",
                      }} />
                      <div style={{ fontSize: 7, color: "#333", textAlign: "center", lineHeight: 1 }}>{d.day.slice(5)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 9, color: "#555" }}>
                  <span><span style={{ color: "#22c55e" }}>■</span> {"<"}1.5s</span>
                  <span><span style={{ color: ORANGE }}>■</span> 1.5–3s</span>
                  <span><span style={{ color: "#ef4444" }}>■</span> {">"}3s</span>
                </div>
              </div>
            );
          })()}

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

      {/* ── Knowledge Library view ── */}
      {view === "knowledge" && (
        <div>
          {/* Toolbar */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#444", pointerEvents: "none" }} />
              <input
                value={kbSearch}
                onChange={e => setKbSearch(e.target.value)}
                placeholder="Search entries…"
                style={{ width: "100%", boxSizing: "border-box", background: "#111", border: "1px solid #222", borderRadius: 8, padding: "7px 10px 7px 28px", color: "#ccc", fontSize: 12, outline: "none" }}
              />
            </div>
            <button
              onClick={() => { setKbForm(blankForm()); }}
              style={{ background: `${ORANGE}18`, border: `1px solid ${ORANGE}44`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: ORANGE, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
            >
              <Plus size={11} /> New Entry
            </button>
          </div>

          {/* Create / Edit form */}
          {kbForm !== null && (
            <div style={{ margin: 14, background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: ORANGE, marginBottom: 12 }}>
                {kbForm.id ? "Edit Entry" : "New Knowledge Entry"}
              </div>
              {/* Title */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>TITLE *</div>
                <input value={kbForm.title} onChange={e => setKbForm(f => f && { ...f, title: e.target.value })}
                  placeholder="e.g. First Amendment Retaliation — Public Employees"
                  style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }} />
              </div>
              {/* Summary */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>SUMMARY * (1–2 sentences)</div>
                <textarea value={kbForm.summary} onChange={e => setKbForm(f => f && { ...f, summary: e.target.value })} rows={2}
                  placeholder="Brief description shown in search results and AI context headers."
                  style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              {/* Body */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>BODY * (full content injected into AI prompts)</div>
                <textarea value={kbForm.body} onChange={e => setKbForm(f => f && { ...f, body: e.target.value })} rows={6}
                  placeholder="Full authoritative content: statutes, case law excerpts, procedural steps, rights explanations…"
                  style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              {/* Category + Jurisdiction row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>CATEGORY</div>
                  <select value={kbForm.category} onChange={e => setKbForm(f => f && { ...f, category: e.target.value })}
                    style={{ width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>JURISDICTION (optional)</div>
                  <input value={kbForm.jurisdiction} onChange={e => setKbForm(f => f && { ...f, jurisdiction: e.target.value })}
                    placeholder="e.g. Kentucky, Federal, or leave blank for all"
                    style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }} />
                </div>
              </div>
              {/* Tags + Keywords row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>TAGS (comma-separated)</div>
                  <input value={kbForm.tagsStr} onChange={e => setKbForm(f => f && { ...f, tagsStr: e.target.value })}
                    placeholder="e.g. retaliation, first amendment"
                    style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>SEARCH KEYWORDS (comma-separated)</div>
                  <input value={kbForm.keywordsStr} onChange={e => setKbForm(f => f && { ...f, keywordsStr: e.target.value })}
                    placeholder="e.g. fired speech government employee"
                    style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }} />
                </div>
              </div>
              {/* Source + isActive row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>SOURCE (optional citation or URL)</div>
                  <input value={kbForm.source} onChange={e => setKbForm(f => f && { ...f, source: e.target.value })}
                    placeholder="e.g. 42 U.S.C. § 1983 or https://…"
                    style={{ width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: "8px 10px", color: "#ccc", fontSize: 12, outline: "none" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setKbForm(f => f && { ...f, isActive: !f.isActive })}
                    style={{ background: "none", border: "none", cursor: "pointer", color: kbForm.isActive ? "#22c55e" : "#555", display: "flex", alignItems: "center", gap: 5, padding: "8px 0", fontSize: 11, fontWeight: 700 }}
                  >
                    {kbForm.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    {kbForm.isActive ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveKbEntry} disabled={kbSaving || !kbForm.title.trim() || !kbForm.summary.trim() || !kbForm.body.trim()}
                  style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", color: "#000", fontWeight: 800, fontSize: 12 }}>
                  {kbSaving ? "Saving…" : kbForm.id ? "Save Changes" : "Create Entry"}
                </button>
                <button onClick={() => setKbForm(null)}
                  style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "9px 14px", cursor: "pointer", color: "#666", fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Entry list */}
          <div style={{ maxHeight: kbForm ? 260 : 480, overflowY: "auto" }}>
            {kbLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading library…</div>
            ) : filteredKb.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>
                {kbSearch ? `No entries matching "${kbSearch}"` : "No knowledge entries yet. Click New Entry to add the first one."}
              </div>
            ) : filteredKb.map(entry => {
              const expanded = kbExpandedId === entry.id;
              const catColor = CAT_COLORS[entry.category] ?? "#666";
              return (
                <div key={entry.id} style={{ borderBottom: "1px solid #0e0e0e" }}>
                  {/* Row header */}
                  <div style={{ padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
                    onClick={() => setKbExpandedId(expanded ? null : entry.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: entry.isActive ? "#ccc" : "#555" }}>{entry.title}</span>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${catColor}20`, color: catColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
                          {entry.category}
                        </span>
                        {!entry.isActive && (
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#1a1a1a", color: "#555", fontWeight: 700 }}>INACTIVE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#555", lineHeight: 1.4 }}>{entry.summary}</div>
                      {entry.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                          {entry.tags.map(tag => (
                            <span key={tag} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: "#1a1a1a", color: "#666" }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); toggleKbActive(entry); }}
                        title={entry.isActive ? "Deactivate" : "Activate"}
                        style={{ background: "none", border: "none", cursor: "pointer", color: entry.isActive ? "#22c55e" : "#555", padding: 4 }}>
                        {entry.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); editEntry(entry); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteKbEntry(entry.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#4a1a1a", padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                      {expanded ? <ChevronUp size={13} color="#555" /> : <ChevronDown size={13} color="#555" />}
                    </div>
                  </div>
                  {/* Expanded body */}
                  {expanded && (
                    <div style={{ padding: "0 14px 14px" }}>
                      <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.body}</div>
                        {(entry.source || entry.jurisdiction) && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a1a", display: "flex", gap: 16, flexWrap: "wrap" }}>
                            {entry.source && <span style={{ fontSize: 10, color: "#444" }}>Source: {entry.source}</span>}
                            {entry.jurisdiction && <span style={{ fontSize: 10, color: "#444" }}>Jurisdiction: {entry.jurisdiction}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer count */}
          {!kbLoading && kbEntries.length > 0 && (
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${LINE}`, fontSize: 10, color: "#444" }}>
              {kbEntries.filter(e => e.isActive).length} active · {kbEntries.length} total
            </div>
          )}
        </div>
      )}

      {/* ── Revenue / Platform Stats view ── */}
      {view === "revenue" && (
        <div>
          {revenueLoading && (
            <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 13 }}>Loading platform stats…</div>
          )}
          {platformStats && !revenueLoading && (
            <div>
              {/* Big stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0, borderBottom: `1px solid ${LINE}` }}>
                {[
                  {
                    label: "Total Users",
                    value: platformStats.totalUsers.toLocaleString(),
                    icon: <Users size={14} color={ORANGE} />,
                    sub: "Registered in HyperLaw",
                  },
                  {
                    label: "Stripe Revenue",
                    value: `${(platformStats.stripeRevenueCents / 100).toFixed(2)}`,
                    icon: <DollarSign size={14} color={ORANGE} />,
                    sub: "From successful payments",
                  },
                  {
                    label: "Credits Sold",
                    value: platformStats.creditsSold.toLocaleString(),
                    icon: <Zap size={14} color={ORANGE} />,
                    sub: "Via Stripe checkout",
                  },
                  {
                    label: "Documents Unlocked",
                    value: platformStats.unlockedDocs.toLocaleString(),
                    icon: <Unlock size={14} color={ORANGE} />,
                    sub: `${platformStats.previewDocs} previews pending`,
                  },
                ].map((stat, i) => (
                  <div key={i} style={{
                    padding: "16px 14px",
                    borderRight: i % 2 === 0 ? `1px solid ${LINE}` : "none",
                    borderBottom: i < 2 ? `1px solid ${LINE}` : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      {stat.icon}
                      <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5 }}>{stat.label.toUpperCase()}</div>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: ORANGE, letterSpacing: "-0.02em" }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Document funnel */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>DOCUMENT FUNNEL</div>
                {platformStats.totalDocs > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "Generated (Previews)", value: platformStats.totalDocs, color: "#555" },
                      { label: "Unlocked (Paid)", value: platformStats.unlockedDocs, color: ORANGE },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 110, fontSize: 11, color: "#888" }}>{row.label}</div>
                        <div style={{ flex: 1, height: 6, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${platformStats.totalDocs > 0 ? (row.value / platformStats.totalDocs) * 100 : 0}%`,
                            height: "100%", background: row.color, borderRadius: 3,
                            transition: "width 0.4s",
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#666", width: 30, textAlign: "right" }}>{row.value}</div>
                        <div style={{ fontSize: 10, color: "#444", width: 36, textAlign: "right" }}>
                          {platformStats.totalDocs > 0
                            ? `${Math.round((row.value / platformStats.totalDocs) * 100)}%`
                            : "0%"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#444", fontStyle: "italic" }}>No documents generated yet.</div>
                )}
              </div>

              {/* Conversion rate */}
              {platformStats.totalDocs > 0 && (
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>CONVERSION RATE</div>
                  <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
                    <span style={{ color: ORANGE, fontWeight: 800, fontSize: 20 }}>
                      {Math.round((platformStats.unlockedDocs / platformStats.totalDocs) * 100)}%
                    </span>
                    {" "}of generated previews converted to paid unlocks.
                  </div>
                  {platformStats.creditsSold > 0 && (
                    <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                      Avg revenue per credit sold: ${((platformStats.stripeRevenueCents / 100) / platformStats.creditsSold).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!platformStats && !revenueLoading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <button onClick={loadRevenue}
                style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Load Stats
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Errors view ── */}
      {view === "errors" && (
        <div>
          {errorLogsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading error logs…</div>
          ) : errorLogs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>
              No server errors logged yet.
              <br />
              <span style={{ fontSize: 11, color: "#3a3a3a" }}>Upload failures and processing errors appear here automatically.</span>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", maxHeight: 460 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                      {["Time", "Context", "Message", "User"].map((h, i) => (
                        <th key={i} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 700, fontSize: 10, letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #0e0e0e", background: i % 2 === 0 ? "transparent" : "#050505" }}>
                        <td style={{ padding: "7px 10px", color: "#555", whiteSpace: "nowrap" }}>
                          {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 9, background: "#2a1a1a", color: "#ef4444", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                            {log.context.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px", color: "#aaa", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.message}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#555", whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {log.userId ? `${log.userId.slice(0, 12)}…` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errorLogsTotal > ERROR_LOGS_PAGE_SIZE && (
                <div style={{ padding: "8px 14px", borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>
                    Page {errorLogsPage} of {Math.ceil(errorLogsTotal / ERROR_LOGS_PAGE_SIZE)} · {errorLogsTotal} total
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { const p = errorLogsPage - 1; setErrorLogsPage(p); loadErrorLogs(p); }}
                      disabled={errorLogsPage <= 1}
                      style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: errorLogsPage <= 1 ? "#333" : "#888", cursor: errorLogsPage <= 1 ? "not-allowed" : "pointer" }}>
                      ← Prev
                    </button>
                    <button onClick={() => { const p = errorLogsPage + 1; setErrorLogsPage(p); loadErrorLogs(p); }}
                      disabled={errorLogsPage >= Math.ceil(errorLogsTotal / ERROR_LOGS_PAGE_SIZE)}
                      style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: errorLogsPage >= Math.ceil(errorLogsTotal / ERROR_LOGS_PAGE_SIZE) ? "#333" : "#888", cursor: errorLogsPage >= Math.ceil(errorLogsTotal / ERROR_LOGS_PAGE_SIZE) ? "not-allowed" : "pointer" }}>
                      Next →
                    </button>
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
