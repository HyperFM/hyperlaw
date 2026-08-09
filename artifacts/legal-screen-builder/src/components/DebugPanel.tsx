import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscribeDebugLog, clearDebugLog, setDebugEnabled } from "../lib/debugLog";

// Mounted once at the app root (App.tsx), outside the view-switching logic,
// so it's present on every page and the log survives navigating between
// them — it used to live only inside VideoWorkspaceView, which meant it
// vanished (log and all) the moment you left the Studio. Admin/tester
// accounts only; never auto-clears — only the Clear button in here does.
export default function DebugPanel({ enabled }: { enabled: boolean }) {
  const [log, setLog] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setDebugEnabled(enabled); }, [enabled]);
  useEffect(() => subscribeDebugLog(setLog), []);

  if (!enabled) return null;

  return (
    <>
      {/* ── Pull-tab — only shows once there's anything logged, doesn't cover
          the screen the way a fixed bottom overlay would. ── */}
      {log.length > 0 && !open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 9998,
            background: "#0a0a0a", border: "1px solid #333", borderRight: "none",
            borderRadius: "8px 0 0 8px", padding: "10px 6px", cursor: "pointer",
            writingMode: "vertical-rl", fontFamily: "monospace", fontSize: 10, fontWeight: 700,
            color: "#0f0", letterSpacing: 1,
          }}>
          DEBUG ({log.length})
        </button>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(320px, 85vw)", height: "min(320px, 85vw)",
              background: "rgba(0,0,0,0.94)", border: "1px solid #333", borderRadius: 14,
              display: "flex", flexDirection: "column",
              boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            }}>
            <div style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
              padding: "10px 10px", borderBottom: "1px solid #222",
            }}>
              <div style={{ flex: 1, fontWeight: 700, color: "#ff0", fontSize: 11, fontFamily: "monospace" }}>
                DIAGNOSTICS ({log.length})
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(log.join("\n")).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                style={{ background: copied ? "#1a3a1a" : "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, color: copied ? "#4ade80" : "#aaa", fontFamily: "monospace" }}>
                {copied ? "Copied!" : "Copy all"}
              </button>
              <button
                onClick={clearDebugLog}
                style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#aaa", fontFamily: "monospace" }}>
                Clear
              </button>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
                <X size={14} color="#888" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontFamily: "monospace", fontSize: 10, color: "#0f0", lineHeight: 1.5 }}>
              {log.map((line, i) => (
                <div key={i} style={{ color: line.startsWith("[4]") || line.startsWith("[ERR]") ? "#f55" : "#0f0", wordBreak: "break-all" }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
