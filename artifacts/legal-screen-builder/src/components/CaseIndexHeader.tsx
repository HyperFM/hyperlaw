import { CheckCircle2, Clock } from "lucide-react";
import type { StructuredCase } from "../types";

const ORANGE = "#d9711f";

function fmtDue(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(`${d}T12:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The top of the Index: where the case stands, what to do next, and what the person
 * is waiting on — so they can pick up where they left off. Details and history stay below.
 */
export function CaseIndexHeader({ structured }: { structured: StructuredCase | undefined }) {
  const items = structured?.nextUp ?? [];
  const todos = items.filter(i => i.kind === "todo");
  const waiting = items.filter(i => i.kind === "waiting");
  const updated = structured?.organizedAt
    ? new Date(structured.organizedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const row = (i: NonNullable<StructuredCase["nextUp"]>[number], k: number, icon: React.ReactNode) => (
    <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: k ? "1px solid #1a1a1a" : "none" }}>
      <div style={{ marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "#ddd", lineHeight: 1.45 }}>{i.text}</div>
        {(fmtDue(i.dueDate) || i.note) && (
          <div style={{ fontSize: 12, color: "#777", marginTop: 3, lineHeight: 1.4 }}>
            {fmtDue(i.dueDate) && <span style={{ color: ORANGE, fontWeight: 700 }}>{fmtDue(i.dueDate)}</span>}
            {fmtDue(i.dueDate) && i.note ? " · " : ""}
            {i.note}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: "#0f0f0f", border: `1px solid ${ORANGE}33`, borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: ORANGE, textTransform: "uppercase" }}>Where you left off</div>
          {updated && <div style={{ fontSize: 11, color: "#555" }}>Updated {updated}</div>}
        </div>

        {structured?.whereThingsStand && (
          <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.55, marginBottom: items.length ? 10 : 0 }}>{structured.whereThingsStand}</div>
        )}

        {todos.length > 0 && (
          <div style={{ marginBottom: waiting.length ? 8 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: "#666", textTransform: "uppercase", marginBottom: 2 }}>Do next</div>
            {todos.map((i, k) => row(i, k, <CheckCircle2 size={15} color={ORANGE} />))}
          </div>
        )}
        {waiting.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: "#666", textTransform: "uppercase", marginBottom: 2 }}>Waiting on</div>
            {waiting.map((i, k) => row(i, k, <Clock size={15} color="#8b8b8b" />))}
          </div>
        )}

        {!structured?.whereThingsStand && items.length === 0 && (
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>Nothing pending is recorded yet. As you add to your case, what to do next and what you're waiting on will show up here.</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11.5, color: "#666", lineHeight: 1.55, padding: "0 4px" }}>
        HyperLaw can't see your court's records or send you updates from the court. You're responsible for keeping track of your own case — check with your court clerk's office yourself so nothing catches you by surprise. This page only reflects what you've entered or uploaded.
      </div>
    </div>
  );
}
