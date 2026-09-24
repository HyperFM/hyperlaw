import type { HLCase } from "../types";

const ORANGE = "#d9711f";

function fmtDue(d: string): string | null {
  const t = new Date(`${d}T12:00:00`);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Short summary shown on the case page. The full details still live on the case and feed the AI behind the scenes. */
export function CaseSummaryCompact({ hlCase, statusLabel }: { hlCase: HLCase; statusLabel: string }) {
  const names = hlCase.parties.map(p => [p.firstName, p.lastName].filter(Boolean).join(" ")).filter(Boolean);
  const partiesText = names.length === 0 ? null : names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  const court = hlCase.court?.name || hlCase.jurisdiction || null;
  const nextDated = (hlCase.structuredCase?.nextUp ?? []).find(i => i.dueDate && fmtDue(i.dueDate));
  const rows: Array<[string, string]> = [];
  if (partiesText) rows.push(["Parties", partiesText]);
  if (court) rows.push(["Court", court]);
  if (nextDated?.dueDate) rows.push(["Next date", `${fmtDue(nextDated.dueDate)} — ${nextDated.text}`]);
  rows.push(["Status", statusLabel]);

  return (
    <div style={{ marginBottom: 20, background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: "6px 14px" }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? "1px solid #181818" : "none", alignItems: "baseline" }}>
          <div style={{ width: 76, flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: ORANGE, opacity: 0.85 }}>{k}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "#ccc", lineHeight: 1.4 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
