import { useCallback, useEffect, useState } from "react";
import { aiApi, type AdminSpend } from "../lib/aiApi";

const ORANGE = "#d9711f";
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;

/** Admin: what the AI is really costing — today, this week, by feature and by user — plus the pause and billing switches. */
export function SpendPanel() {
  const [d, setD] = useState<AdminSpend | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    aiApi.admin.spend().then(x => { setD(x); setErr(null); }).catch(e => setErr((e as Error).message || "Couldn't load spend"));
  }, []);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (err && !d) return <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>{err}</div>;
  if (!d) return <div style={{ padding: 16, color: "#666", fontSize: 13 }}>Loading spend…</div>;

  const pct = Math.min(100, (d.globalSpendTodayMicroUsd / d.globalPauseMicroUsd) * 100);
  const box = { background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px" } as const;
  const label = { fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#666" } as const;
  const btn = { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8, padding: "7px 12px", color: "#ddd", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" } as const;

  return (
    <div style={{ padding: 16, borderBottom: "1px solid #1a1a1a" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ ...box, flex: 1 }}><div style={label}>Today</div><div style={{ fontSize: 22, fontWeight: 800, color: "#eee" }}>{usd(d.todayMicroUsd)}</div><div style={{ fontSize: 11, color: "#666" }}>{d.todayCalls} calls</div></div>
        <div style={{ ...box, flex: 1 }}><div style={label}>Last 7 days</div><div style={{ fontSize: 22, fontWeight: 800, color: "#eee" }}>{usd(d.weekMicroUsd)}</div><div style={{ fontSize: 11, color: "#666" }}>{d.weekCalls} calls</div></div>
      </div>

      <div style={{ ...box, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={label}>Combined spend vs emergency pause</div>
          <div style={{ fontSize: 11, color: d.paused ? "#ef4444" : "#666" }}>{d.paused ? "AI PAUSED" : `alert ${usd(d.globalAlertMicroUsd)} · pause ${usd(d.globalPauseMicroUsd)}`}</div>
        </div>
        <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, margin: "8px 0" }}><div style={{ width: `${pct}%`, height: "100%", background: pct > 40 ? "#ef4444" : ORANGE, borderRadius: 3 }} /></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {d.paused
            ? <button style={btn} disabled={busy} onClick={() => act(() => aiApi.admin.resumeAi())}>Resume AI</button>
            : <button style={btn} disabled={busy} onClick={() => act(() => aiApi.admin.pauseAi())}>Pause AI now</button>}
          <div style={{ fontSize: 11, color: "#666" }}>Per-user daily limits: free {usd(d.perUserLimitMicroUsd.free)} · pro {usd(d.perUserLimitMicroUsd.prosay)} · apex {usd(d.perUserLimitMicroUsd.apex)}</div>
        </div>
      </div>

      <div style={{ ...box, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={label}>Billing</div>
          <div style={{ fontSize: 13, color: d.billingEnabled ? "#22c55e" : "#aaa" }}>{d.billingEnabled ? "ON — users are charged credits per real AI call" : "OFF — nothing is charged"}</div>
        </div>
        <button style={btn} disabled={busy} onClick={() => { if (window.confirm(d.billingEnabled ? "Turn billing OFF?" : "Turn billing ON? Users will start being charged credits. Only do this once checkout works.")) void act(() => aiApi.admin.setBilling(!d.billingEnabled)); }}>
          Turn {d.billingEnabled ? "off" : "on"}
        </button>
      </div>

      {d.staleRates.length > 0 && (
        <div style={{ ...box, marginBottom: 10, borderColor: "#4a3800", background: "#1c1600" }}>
          <div style={label}>Prices to check</div>
          <div style={{ fontSize: 12.5, color: "#d8c27a", marginTop: 4 }}>{d.staleRates.map(r => `${r.model} (${r.daysOld === null ? "never confirmed" : `${r.daysOld}d`})`).join(" · ")}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...box, flex: "1 1 240px" }}>
          <div style={label}>By feature (7 days)</div>
          {d.byRoute.slice(0, 8).map(r => <div key={r.feature} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#ccc", padding: "4px 0" }}><span>{r.feature}</span><span>{usd(r.cost)} · {r.calls}</span></div>)}
          {d.byRoute.length === 0 && <div style={{ fontSize: 12, color: "#555", paddingTop: 4 }}>No calls yet</div>}
        </div>
        <div style={{ ...box, flex: "1 1 240px" }}>
          <div style={label}>By user (7 days)</div>
          {d.byUser.slice(0, 8).map(r => <div key={r.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#ccc", padding: "4px 0" }}><span>{r.userId.slice(0, 8)}…</span><span>{usd(r.cost)} · {r.calls}</span></div>)}
          {d.byUser.length === 0 && <div style={{ fontSize: 12, color: "#555", paddingTop: 4 }}>No calls yet</div>}
        </div>
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{err}</div>}
    </div>
  );
}
