import React, { useEffect, useState } from "react";
import { X, Zap, Loader2, Clock, AlertCircle } from "lucide-react";
import { aiApi, CreditHistoryEntry, featureLabel } from "../lib/aiApi";

const ORANGE = "#d9711f";

interface Props {
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// Friendly one-line description for each feature
function describeEntry(entry: CreditHistoryEntry): string {
  const label = featureLabel(entry.feature);
  if (entry.caseTitle) return `${label} — ${entry.caseTitle}`;
  return label;
}

export default function CreditHistoryModal({ onClose }: Props) {
  const [entries, setEntries] = useState<CreditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiApi.creditHistory()
      .then(r => setEntries(r.entries))
      .catch(() => setError("Could not load credit history. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const totalCharged = entries.reduce((sum, e) => sum + e.creditsCharged, 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#0e0e0e", border: "1px solid #1e1e1e",
        borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560,
        maxHeight: "90dvh", display: "flex", flexDirection: "column",
      }}>
        {/* Drag handle + header */}
        <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 16px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={18} color={ORANGE} />
              <span style={{ fontWeight: 800, fontSize: 17 }}>Credit History</span>
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>
          {!loading && !error && entries.length > 0 && (
            <p style={{ color: "#555", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              {entries.length} charge{entries.length !== 1 ? "s" : ""} · {totalCharged} credit{totalCharged !== 1 ? "s" : ""} spent total
            </p>
          )}
          {(loading || error || entries.length === 0) && (
            <div style={{ height: 8 }} />
          )}
          <div style={{ height: 1, background: "#1a1a1a", marginLeft: -20, marginRight: -20 }} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 calc(env(safe-area-inset-bottom) + 20px)" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Loader2 size={24} color="#444" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {!loading && error && (
            <div style={{ margin: 20, background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Zap size={32} color="#2a2a2a" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontWeight: 700, fontSize: 15, color: "#444", marginBottom: 6 }}>No charges yet</div>
              <div style={{ color: "#333", fontSize: 13, lineHeight: 1.6 }}>
                Credits are deducted when you generate documents or run document analysis. Your spending will appear here.
              </div>
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div>
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  style={{
                    padding: "14px 20px",
                    borderBottom: i < entries.length - 1 ? "1px solid #141414" : "none",
                    display: "flex", alignItems: "center", gap: 12,
                  }}
                >
                  {/* Credit badge */}
                  <div style={{
                    flexShrink: 0, width: 36, height: 36,
                    background: "#1a1a1a", border: "1px solid #2a2a2a",
                    borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Zap size={15} color={ORANGE} fill={ORANGE} />
                  </div>

                  {/* Description + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: "#ccc",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {describeEntry(entry)}
                    </div>
                    <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
                      {formatDate(entry.date)} at {formatTime(entry.date)}
                    </div>
                  </div>

                  {/* Credits charged */}
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#888" }}>
                      <span style={{ color: "#555", fontSize: 12, marginRight: 2 }}>−</span>
                      {entry.creditsCharged}
                    </div>
                    <div style={{ fontSize: 10, color: "#333" }}>
                      credit{entry.creditsCharged !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
