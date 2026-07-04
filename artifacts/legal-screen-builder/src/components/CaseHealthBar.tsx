import { HLCase, CaseHealth, computeCaseHealth, caseCompletionPct } from "../types";

const ORANGE = "#f45d01";

interface Props {
  hlCase: HLCase;
  hasDocuments?: boolean;
  compact?: boolean;
}

const STEPS: Array<{ key: keyof CaseHealth; label: string }> = [
  { key: "parties",   label: "Parties" },
  { key: "court",     label: "Court" },
  { key: "story",     label: "Story" },
  { key: "timeline",  label: "Timeline" },
  { key: "documents", label: "Documents" },
];

export function CaseHealthBar({ hlCase, hasDocuments = false, compact = false }: Props) {
  const health = computeCaseHealth(hlCase, hasDocuments);
  const pct = caseCompletionPct(health);

  if (compact) {
    // Dots only
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {STEPS.map(s => (
          <div
            key={s.key}
            title={s.label}
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: health[s.key] ? ORANGE : "#2a2521",
              border: health[s.key] ? `1px solid ${ORANGE}88` : "1px solid #3a3530",
              transition: "background 0.2s",
            }}
          />
        ))}
        <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>{pct}%</span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Case Health</div>
        <div style={{ fontSize: 11, color: pct === 100 ? "#4ade80" : ORANGE, fontWeight: 700 }}>{pct}% Complete</div>
      </div>
      <div style={{ height: 3, background: "#1e1e1e", borderRadius: 2, marginBottom: 14, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`,
          borderRadius: 2, transition: "width 0.4s ease",
        }} />
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 6 }}>
        {STEPS.map(s => {
          const done = health[s.key];
          return (
            <div key={s.key} style={{
              flex: 1, textAlign: "center", padding: "8px 4px",
              background: done ? "#0d1e0a" : "#0e0e0e",
              border: `1px solid ${done ? "#2a5a22" : "#1e1e1e"}`,
              borderRadius: 8, transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 14, marginBottom: 3 }}>{done ? "✓" : "○"}</div>
              <div style={{ fontSize: 10, color: done ? "#4ade80" : "#444", fontWeight: 600, letterSpacing: 0.3 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
