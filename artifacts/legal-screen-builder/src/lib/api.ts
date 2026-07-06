const BASE = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

export interface ServerCase {
  id: string;
  userId: string;
  title: string;
  workflowStage: string;
  caseData: Record<string, unknown>;
  structuredCase: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  status: string;
  retentionDays: number | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}

export interface ClerkUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: { email_address: string }[];
  created_at: number;
  image_url: string | null;
}

export const api = {
  notifications: {
    list: () => apiFetch<AppNotification[]>("/notifications"),
    markRead: (id: string) => apiFetch<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PUT" }),
    markAllRead: () => apiFetch<{ ok: boolean }>("/notifications/read-all", { method: "PUT" }),
  },
  feedback: {
    submit: (message: string, type = "general") =>
      apiFetch<{ ok: boolean }>("/feedback", { method: "POST", body: JSON.stringify({ message, type }) }),
  },
  admin: {
    users: () => apiFetch<ClerkUser[]>("/admin/users"),
    chatSessions: () => apiFetch<ChatSession[]>("/admin/chat-sessions"),
    openChat: (userId: string, userEmail: string, userName: string) =>
      apiFetch<ChatSession>(`/admin/chat/${userId}`, { method: "POST", body: JSON.stringify({ userEmail, userName }) }),
    getMessages: (sessionId: string) => apiFetch<ChatMessage[]>(`/admin/messages/${sessionId}`),
    sendMessage: (sessionId: string, body: string) =>
      apiFetch<ChatMessage>(`/admin/messages/${sessionId}`, { method: "POST", body: JSON.stringify({ body }) }),
    updateRetention: (sessionId: string, status: string, retentionDays: number | null) =>
      apiFetch<ChatSession>(`/admin/sessions/${sessionId}/retention`, { method: "PUT", body: JSON.stringify({ status, retentionDays }) }),
  },
  chat: {
    session: () => apiFetch<ChatSession | null>("/chat/session"),
    messages: (sessionId: string) => apiFetch<ChatMessage[]>(`/chat/messages/${sessionId}`),
    reply: (sessionId: string, body: string) =>
      apiFetch<ChatMessage>(`/chat/messages/${sessionId}`, { method: "POST", body: JSON.stringify({ body }) }),
  },
  cases: {
    /** List all cases for the current user (server-persisted) */
    list: () => apiFetch<ServerCase[]>("/cases"),
    /** Create or update a case on the server */
    upsert: (id: string, title: string, workflowStage: string, caseData: Record<string, unknown>) =>
      apiFetch<{ ok: boolean }>("/cases", {
        method: "POST",
        body: JSON.stringify({ id, title, workflowStage, caseData }),
      }),
    /** Save Organization Engine output to the case */
    saveStructured: (id: string, structuredCase: Record<string, unknown>) =>
      apiFetch<{ ok: boolean }>(`/cases/${id}/structured`, {
        method: "PATCH",
        body: JSON.stringify({ structuredCase }),
      }),
    /** Delete a case from the server */
    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/cases/${id}`, { method: "DELETE" }),
  },
};
