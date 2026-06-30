// ─── Block system ─────────────────────────────────────────────────────────────

export type BlockType =
  | "eyebrow"
  | "headline"
  | "subheadline"
  | "divider"
  | "quote_card"
  | "evidence_card"
  | "comparison"
  | "fact_list"
  | "icon_bullets"
  | "legal_box"
  | "callout"
  | "policy_row"
  | "spacer";

export interface Block {
  id: string;
  type: BlockType;
  data: Record<string, string>;
  flex?: number;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export interface Screen {
  id: string;
  title: string;
  screenType: string;
  screenNumber: string;
  footerCitations: string[];
  blocks: Block[];
  createdAt: number;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceType = "bodycam" | "report" | "statement" | "document" | "photo" | "other";

export interface Evidence {
  id: string;
  type: EvidenceType;
  label: string;
  source: string;
  content: string;
  timestamp?: string;
}

// ─── Citations ────────────────────────────────────────────────────────────────

export interface Citation {
  id: string;
  label: string;
  builtin?: boolean;
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  caseName: string;
  screens: Screen[];
  evidence: Evidence[];
  citations: Citation[];
  updatedAt: number;
}

// ─── Conversation ────────────────────────────────────────────────────────────

export type ScreenType =
  | "contradiction"
  | "quote"
  | "prior_incident"
  | "admission"
  | "policy_violation";

export type DataMap = Record<string, string>;

export interface QNode {
  id: string;
  question: string;
  subtext?: string;
  type: "text" | "textarea" | "choice";
  key: string;
  choices?: { label: string; value: string }[];
  evidenceTypes?: EvidenceType[];
  next: string | null | ((answer: string, data: DataMap) => string | null);
}

export interface ChatEntry {
  nodeId: string;
  question: string;
  answer: string;
}

// ─── Block field definitions (for editor) ────────────────────────────────────

export interface BlockFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean";
}

export const BLOCK_FIELDS: Record<BlockType, BlockFieldDef[]> = {
  eyebrow: [
    { key: "person", label: "Name / Role", type: "text" },
    { key: "violation", label: "Violation Tag", type: "text" },
  ],
  headline: [
    { key: "text", label: "Headline Text", type: "textarea" },
    { key: "size", label: "Font Size (default 52)", type: "number" },
    { key: "color", label: "Color (default #fff)", type: "text" },
  ],
  subheadline: [
    { key: "text", label: "Text", type: "textarea" },
    { key: "orange", label: "Orange (true/false)", type: "boolean" },
  ],
  divider: [],
  quote_card: [
    { key: "label", label: "Label (e.g. STATEMENT A)", type: "text" },
    { key: "source", label: "Source", type: "text" },
    { key: "quote", label: "Quote Text", type: "textarea" },
  ],
  evidence_card: [
    { key: "label", label: "Label", type: "text" },
    { key: "source", label: "Source", type: "text" },
    { key: "content", label: "Content", type: "textarea" },
  ],
  comparison: [
    { key: "labelA", label: "Label A", type: "text" },
    { key: "sourceA", label: "Source A", type: "text" },
    { key: "contentA", label: "Statement A", type: "textarea" },
    { key: "labelB", label: "Label B", type: "text" },
    { key: "sourceB", label: "Source B", type: "text" },
    { key: "contentB", label: "Statement B", type: "textarea" },
  ],
  fact_list: [
    { key: "items", label: "Facts (one per line)", type: "textarea" },
  ],
  icon_bullets: [
    { key: "items", label: "Bullets (one per line)", type: "textarea" },
  ],
  legal_box: [
    { key: "label", label: "Box Label", type: "text" },
    { key: "content", label: "Content", type: "textarea" },
  ],
  callout: [
    { key: "label", label: "Label", type: "text" },
    { key: "content", label: "Content", type: "textarea" },
  ],
  policy_row: [
    { key: "policyLabel", label: "Policy Label", type: "text" },
    { key: "policyContent", label: "Policy Requirement", type: "textarea" },
    { key: "actualLabel", label: "Actual Action Label", type: "text" },
    { key: "actualContent", label: "What Actually Happened", type: "textarea" },
  ],
  spacer: [
    { key: "height", label: "Height (px)", type: "number" },
  ],
};
