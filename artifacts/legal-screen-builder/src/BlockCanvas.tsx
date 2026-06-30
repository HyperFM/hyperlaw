import React from "react";
import { Block } from "./types";
import { User, MessageSquare, Shield, CheckCircle, XCircle, FileSearch, Clock, AlertTriangle, ChevronRight, Quote, Mic, Scale } from "lucide-react";

const ORANGE = "#d9711f";

// ─── Shared primitives ────────────────────────────────────────────────────────

function Divr({ h = 2 }: { h?: number }) {
  return <div style={{ height: h, background: ORANGE, flexShrink: 0 }} />;
}

function LBl({ children }: { children: React.ReactNode }) {
  return <div style={{ color: ORANGE, fontWeight: 800, fontSize: 14, letterSpacing: 0.5, marginBottom: 6 }}>{children}</div>;
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function EyebrowBlock({ data }: { data: Record<string, string> }) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", marginBottom: 10, flexShrink: 0 }}>
      <div style={{ color: ORANGE, fontWeight: 800, fontSize: 22, letterSpacing: 0.5 }}>{data.person || "PERSON"}</div>
      {data.violation && <div style={{ color: "#aaa", fontWeight: 700, fontSize: 15, letterSpacing: 1.5, marginTop: 2 }}>{data.violation.toUpperCase()}</div>}
    </div>
  );
}

function HeadlineBlock({ data }: { data: Record<string, string> }) {
  const sz = parseInt(data.size || "52", 10);
  const col = data.color || "#fff";
  return (
    <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: sz, lineHeight: 1.04, color: col, textTransform: "uppercase", letterSpacing: -0.5, flexShrink: 0 }}>
      {data.text || "HEADLINE"}
    </div>
  );
}

function SubheadlineBlock({ data }: { data: Record<string, string> }) {
  const isOrange = data.orange === "true";
  return (
    <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 36, lineHeight: 1.1, color: isOrange ? ORANGE : "#ccc", textTransform: "uppercase", letterSpacing: -0.3, flexShrink: 0 }}>
      {data.text || "Subheadline"}
    </div>
  );
}

function DividerBlock() {
  return <Divr />;
}

function QuoteCardBlock({ data }: { data: Record<string, string> }) {
  return (
    <div style={{ flexShrink: 0 }}>
      {data.label && <LBl>{data.label}</LBl>}
      <div style={{ display: "flex", gap: 12 }}>
        <Quote size={28} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
        <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 26, lineHeight: 1.25, textTransform: "uppercase" }}>{data.quote || "—"}</div>
      </div>
      {data.source && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#888", marginTop: 6 }}>{data.source}</div>}
    </div>
  );
}

function EvidenceCardBlock({ data }: { data: Record<string, string> }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <FileSearch size={18} color={ORANGE} />
        <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 14, color: ORANGE, letterSpacing: 0.5 }}>{data.label || "EVIDENCE"}</span>
        {data.source && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#888" }}>— {data.source}</span>}
      </div>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 18, lineHeight: 1.4 }}>{data.content || "—"}</div>
    </div>
  );
}

function ComparisonBlock({ data, flex }: { data: Record<string, string>; flex?: number }) {
  return (
    <div style={{ display: "flex", gap: 24, flex: flex || undefined }}>
      <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 14 }}>
        {data.labelA && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <User size={18} color={ORANGE} />
              <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 13, color: ORANGE, letterSpacing: 0.5 }}>{data.labelA}</span>
              {data.sourceA && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#666" }}>— {data.sourceA}</span>}
            </div>
            <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, lineHeight: 1.3, textTransform: "uppercase" }}>"{data.contentA || "—"}"</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", color: ORANGE }}>
          <ChevronRight size={24} style={{ transform: "rotate(90deg)" }} />
        </div>
        {data.labelB && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <MessageSquare size={18} color={ORANGE} />
              <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 13, color: ORANGE, letterSpacing: 0.5 }}>{data.labelB}</span>
              {data.sourceB && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#666" }}>— {data.sourceB}</span>}
            </div>
            <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, lineHeight: 1.3, textTransform: "uppercase" }}>"{data.contentB || "—"}"</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FactListBlock({ data, flex }: { data: Record<string, string>; flex?: number }) {
  const items = (data.items || "").split("\n").map(i => i.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: flex || undefined }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontFamily: "Arial, sans-serif" }}>
          <CheckCircle size={20} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 18, lineHeight: 1.3 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

const ICONS_CYCLE = [User, MessageSquare, Shield, CheckCircle, XCircle, FileSearch, Clock, AlertTriangle];

function IconBulletsBlock({ data, flex }: { data: Record<string, string>; flex?: number }) {
  const items = (data.items || "").split("\n").map(i => i.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: flex || undefined }}>
      {items.map((item, i) => {
        const Icon = ICONS_CYCLE[i % ICONS_CYCLE.length];
        return (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", border: `2px solid ${ORANGE}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: ORANGE }}>
              <Icon size={20} />
            </div>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 18, lineHeight: 1.4, paddingTop: 6 }}>{item}</div>
          </div>
        );
      })}
    </div>
  );
}

function LegalBoxBlock({ data }: { data: Record<string, string> }) {
  return (
    <div style={{ border: `1.5px solid ${ORANGE}`, borderRadius: 4, padding: "12px 16px", background: "#d9711f0d", fontFamily: "Arial, sans-serif", flexShrink: 0 }}>
      <LBl>{data.label || "LEGAL SIGNIFICANCE"}</LBl>
      <div style={{ fontSize: 17, lineHeight: 1.4, fontWeight: 700 }}>{data.content || "—"}</div>
    </div>
  );
}

function CalloutBlock({ data }: { data: Record<string, string> }) {
  return (
    <div style={{ background: "#1c1c1c", borderLeft: `4px solid ${ORANGE}`, padding: "12px 16px", fontFamily: "Arial, sans-serif", flexShrink: 0 }}>
      {data.label && <div style={{ color: ORANGE, fontWeight: 800, fontSize: 13, marginBottom: 4, letterSpacing: 0.5 }}>{data.label}</div>}
      <div style={{ fontSize: 17, lineHeight: 1.4 }}>{data.content || "—"}</div>
    </div>
  );
}

function PolicyRowBlock({ data, flex }: { data: Record<string, string>; flex?: number }) {
  return (
    <div style={{ display: "flex", gap: 18, flex: flex || undefined }}>
      <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, padding: "14px 16px", fontFamily: "Arial, sans-serif" }}>
        <div style={{ color: "#888", fontWeight: 800, fontSize: 12, marginBottom: 6, letterSpacing: 0.5 }}>{data.policyLabel || "POLICY REQUIRED"}</div>
        <div style={{ fontSize: 17, lineHeight: 1.4 }}>{data.policyContent || "—"}</div>
      </div>
      <div style={{ flex: 1, border: `1.5px solid ${ORANGE}`, borderRadius: 4, padding: "14px 16px", background: "#d9711f0d", fontFamily: "Arial, sans-serif" }}>
        <div style={{ color: ORANGE, fontWeight: 800, fontSize: 12, marginBottom: 6, letterSpacing: 0.5 }}>{data.actualLabel || "WHAT ACTUALLY HAPPENED"}</div>
        <div style={{ fontSize: 17, lineHeight: 1.4, fontWeight: 700 }}>{data.actualContent || "—"}</div>
      </div>
    </div>
  );
}

function SpacerBlock({ data }: { data: Record<string, string> }) {
  return <div style={{ height: parseInt(data.height || "20", 10) }} />;
}

// ─── Block renderer dispatcher ────────────────────────────────────────────────

function renderBlock(block: Block, onClick?: (id: string) => void, selectedId?: string) {
  const isSelected = selectedId === block.id;
  const isEditMode = !!onClick;

  const wrapper = (children: React.ReactNode) => (
    <div
      key={block.id}
      onClick={isEditMode ? () => onClick!(block.id) : undefined}
      style={{
        flex: block.flex !== undefined ? block.flex : undefined,
        outline: isSelected ? `2px solid ${ORANGE}` : isEditMode ? "1px dashed #333" : "none",
        outlineOffset: 4,
        borderRadius: 2,
        cursor: isEditMode ? "pointer" : "default",
        transition: "outline 0.1s",
        minWidth: 0,
      }}
      onMouseEnter={isEditMode && !isSelected ? (e) => { (e.currentTarget as HTMLDivElement).style.outline = `1px dashed ${ORANGE}55`; } : undefined}
      onMouseLeave={isEditMode && !isSelected ? (e) => { (e.currentTarget as HTMLDivElement).style.outline = "1px dashed #333"; } : undefined}
    >
      {children}
    </div>
  );

  switch (block.type) {
    case "eyebrow": return wrapper(<EyebrowBlock data={block.data} />);
    case "headline": return wrapper(<HeadlineBlock data={block.data} />);
    case "subheadline": return wrapper(<SubheadlineBlock data={block.data} />);
    case "divider": return wrapper(<DividerBlock />);
    case "quote_card": return wrapper(<QuoteCardBlock data={block.data} />);
    case "evidence_card": return wrapper(<EvidenceCardBlock data={block.data} />);
    case "comparison": return wrapper(<ComparisonBlock data={block.data} flex={block.flex} />);
    case "fact_list": return wrapper(<FactListBlock data={block.data} flex={block.flex} />);
    case "icon_bullets": return wrapper(<IconBulletsBlock data={block.data} flex={block.flex} />);
    case "legal_box": return wrapper(<LegalBoxBlock data={block.data} />);
    case "callout": return wrapper(<CalloutBlock data={block.data} />);
    case "policy_row": return wrapper(<PolicyRowBlock data={block.data} flex={block.flex} />);
    case "spacer": return wrapper(<SpacerBlock data={block.data} />);
    default: return null;
  }
}

// ─── Main canvas component ────────────────────────────────────────────────────

interface BlockCanvasProps {
  blocks: Block[];
  screenNumber?: string;
  footerCitations?: string[];
  selectedBlockId?: string;
  onBlockClick?: (id: string) => void;
}

export function BlockCanvas({ blocks, screenNumber, footerCitations, selectedBlockId, onBlockClick }: BlockCanvasProps) {
  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        background: "#0a0a0a",
        border: `3px solid ${ORANGE}`,
        position: "relative",
        padding: "44px 48px 36px 48px",
        boxSizing: "border-box",
        fontFamily: "'Arial Black', Arial, sans-serif",
        color: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Left accent bar */}
      <div style={{ position: "absolute", left: 28, top: 28, bottom: footerCitations?.length ? 80 : 36, width: 5, background: ORANGE }} />
      {/* Screen number */}
      <div style={{ position: "absolute", top: 36, right: 44, fontSize: 40, fontWeight: 900, color: "#8a8a8a", fontFamily: "Arial, sans-serif" }}>
        {screenNumber || "01"}
      </div>

      {/* Blocks */}
      <div style={{ flex: 1, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 14, minHeight: 0, overflow: "hidden" }}>
        {blocks.map(block => renderBlock(block, onBlockClick, selectedBlockId))}
      </div>

      {/* Footer citations */}
      {footerCitations && footerCitations.length > 0 && (
        <div style={{ borderTop: `1px solid ${ORANGE}88`, paddingTop: 12, marginLeft: 24, display: "flex", flexWrap: "wrap", gap: 10, fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, flexShrink: 0 }}>
          {footerCitations.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {i > 0 && <span style={{ color: "#555" }}>•</span>}
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
