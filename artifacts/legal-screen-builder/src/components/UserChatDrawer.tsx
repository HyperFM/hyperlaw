import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, MessageSquare } from "lucide-react";
import { api, ChatSession, ChatMessage } from "../lib/api";

const ORANGE = "#d9711f";

interface UserChatDrawerProps {
  sessionId: string;
  onClose: () => void;
}

export default function UserChatDrawer({ sessionId, onClose }: UserChatDrawerProps) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, msgs] = await Promise.all([
        api.chat.session(),
        api.chat.messages(sessionId),
      ]);
      setSession(s);
      setMessages(msgs);
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  async function send() {
    if (!input.trim()) return;
    setSending(true);
    try {
      const msg = await api.chat.reply(sessionId, input.trim());
      setMessages(prev => [...prev, msg]);
      setInput("");
    } catch {
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 450, display: "flex",
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
        maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={15} color={ORANGE} />
            <span style={{ fontWeight: 800, fontSize: 14 }}>HyperLaw Support</span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#555" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", color: "#444", fontSize: 14, paddingTop: 60 }}>
              <MessageSquare size={36} color="#1e1e1e" style={{ marginBottom: 12 }} />
              <div>This is your direct line to the HyperLaw team.</div>
              <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>We'll reply as soon as possible.</div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.fromAdmin ? "flex-start" : "flex-end" }}>
                {msg.fromAdmin && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 14, background: ORANGE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginRight: 8, alignSelf: "flex-end",
                    fontSize: 11, fontWeight: 800, color: "#000",
                  }}>HL</div>
                )}
                <div style={{
                  maxWidth: "75%", padding: "9px 12px",
                  borderRadius: msg.fromAdmin ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                  background: msg.fromAdmin ? "#1a1a1a" : ORANGE,
                  color: msg.fromAdmin ? "#ccc" : "#000",
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
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid #111", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type a reply…"
            style={{
              flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 10,
              padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            style={{
              background: input.trim() ? ORANGE : "#1a1a1a", border: "none",
              borderRadius: 10, padding: "10px 14px",
              cursor: input.trim() ? "pointer" : "not-allowed",
              color: input.trim() ? "#000" : "#444",
              display: "flex", alignItems: "center",
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
