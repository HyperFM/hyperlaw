import { X, ExternalLink } from "lucide-react";
import { OTHER_APPS } from "../lib/otherApps";
import { openExternal } from "../lib/platform";

const ORANGE = "#d9711f";

/** A simple list promoting the owner's other apps. */
export function OtherAppsModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 20, width: "100%", maxWidth: 440, padding: 24, position: "relative" }}>
        <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#555" /></button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#eee", marginBottom: 4 }}>Other apps</div>
        <div style={{ fontSize: 13, color: "#777", marginBottom: 16, lineHeight: 1.5 }}>More from the maker of HyperLaw.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OTHER_APPS.map(a => (
            <button key={a.name} onClick={() => void openExternal(a.url)} style={{ textAlign: "left", background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 18, padding: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
              <img src={a.icon} alt="" style={{ width: 88, height: 88, borderRadius: 20, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#eee" }}>{a.name}</div>
                <div style={{ fontSize: 12.5, color: "#888", marginTop: 3, lineHeight: 1.4 }}>{a.tagline}</div>
              </div>
              <ExternalLink size={16} color={ORANGE} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
