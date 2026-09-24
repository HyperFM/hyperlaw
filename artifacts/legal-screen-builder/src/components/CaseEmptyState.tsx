import { Upload, MessageSquare, ListChecks } from "lucide-react";

const ORANGE = "#d9711f";

/** What a brand-new (empty) case shows instead of the full case page: three clear ways to begin. */
export function CaseEmptyState({ onUpload, onChat, onGuidedIntake }: { onUpload: () => void; onChat: () => void; onGuidedIntake: () => void }) {
  const card = (opts: { icon: React.ReactNode; title: string; sub: string; onClick?: () => void; soon?: boolean }) => (
    <button
      onClick={opts.onClick}
      disabled={opts.soon}
      style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14,
        background: "#111", border: `1px solid ${opts.soon ? "#1e1e1e" : ORANGE + "44"}`, borderRadius: 14,
        padding: "18px 16px", cursor: opts.soon ? "default" : "pointer", opacity: opts.soon ? 0.55 : 1,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ORANGE}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {opts.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#eee" }}>
          {opts.title}
          {opts.soon && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "#888", letterSpacing: 0.8, textTransform: "uppercase" }}>Coming soon</span>}
        </div>
        <div style={{ fontSize: 13, color: "#777", marginTop: 3, lineHeight: 1.4 }}>{opts.sub}</div>
      </div>
    </button>
  );

  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#eee", marginBottom: 4 }}>How do you want to start?</div>
      <div style={{ fontSize: 13, color: "#777", marginBottom: 16, lineHeight: 1.5 }}>Pick one. You can do the others any time.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {card({ icon: <Upload size={22} color={ORANGE} />, title: "Upload a document", sub: "A complaint, order, report or anything you were given", onClick: onUpload })}
        {card({ icon: <MessageSquare size={22} color={ORANGE} />, title: "Tell us what happened", sub: "Just talk it through. Free — and the chat isn't kept, only what you confirm", onClick: onChat })}
        {card({ icon: <ListChecks size={22} color={ORANGE} />, title: "Guided intake", sub: "Answer a few questions, step by step", onClick: onGuidedIntake })}
      </div>
    </div>
  );
}
