import { Project, Citation, Screen, Evidence, Block } from "./types";

const KEY = "lsb_v2";

export const BUILTIN_CITATIONS: Citation[] = [
  { id: "c_1983", label: "42 U.S.C. § 1983", builtin: true },
  { id: "c_monell", label: "Monell v. Dept of Social Services", builtin: true },
  { id: "c_1a", label: "First Amendment", builtin: true },
  { id: "c_4a", label: "Fourth Amendment", builtin: true },
  { id: "c_14a", label: "Fourteenth Amendment", builtin: true },
  { id: "c_krs", label: "KRS 519.040(1)(d)", builtin: true },
  { id: "c_agency", label: "Agency Policy", builtin: true },
  { id: "c_dept", label: "Department Policy", builtin: true },
  { id: "c_count1", label: "COUNT 1 • FIRST AMENDMENT", builtin: true },
  { id: "c_count4", label: "COUNT 4 • MONELL", builtin: true },
  { id: "c_count8", label: "COUNT 8 • FALSE REPORTING", builtin: true },
];

function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    caseName: "Untitled Case",
    screens: [],
    evidence: [],
    citations: [...BUILTIN_CITATIONS],
    updatedAt: Date.now(),
  };
}

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      // Merge any new builtin citations
      const existingIds = new Set(p.citations.map(c => c.id));
      const merged = [...p.citations];
      BUILTIN_CITATIONS.forEach(c => { if (!existingIds.has(c.id)) merged.push(c); });
      return { ...p, citations: merged };
    }
  } catch {}
  return newProject();
}

export function saveProject(p: Project): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, updatedAt: Date.now() }));
  } catch {}
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────

export function addScreen(p: Project, screen: Screen): Project {
  return { ...p, screens: [...p.screens, screen] };
}

export function updateScreen(p: Project, screen: Screen): Project {
  return { ...p, screens: p.screens.map(s => s.id === screen.id ? screen : s) };
}

export function deleteScreen(p: Project, id: string): Project {
  return { ...p, screens: p.screens.filter(s => s.id !== id) };
}

export function updateBlock(screen: Screen, block: Block): Screen {
  return { ...screen, blocks: screen.blocks.map(b => b.id === block.id ? block : b) };
}

export function addBlock(screen: Screen, block: Block, afterId?: string): Screen {
  if (!afterId) return { ...screen, blocks: [...screen.blocks, block] };
  const idx = screen.blocks.findIndex(b => b.id === afterId);
  const blocks = [...screen.blocks];
  blocks.splice(idx + 1, 0, block);
  return { ...screen, blocks };
}

export function removeBlock(screen: Screen, id: string): Screen {
  return { ...screen, blocks: screen.blocks.filter(b => b.id !== id) };
}

export function moveBlock(screen: Screen, id: string, dir: "up" | "down"): Screen {
  const blocks = [...screen.blocks];
  const idx = blocks.findIndex(b => b.id === id);
  if (idx === -1) return screen;
  if (dir === "up" && idx > 0) [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
  if (dir === "down" && idx < blocks.length - 1) [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
  return { ...screen, blocks };
}

export function addEvidence(p: Project, e: Evidence): Project {
  return { ...p, evidence: [...p.evidence, e] };
}

export function deleteEvidence(p: Project, id: string): Project {
  return { ...p, evidence: p.evidence.filter(e => e.id !== id) };
}

export function addCitation(p: Project, label: string): Project {
  const citation: Citation = { id: crypto.randomUUID(), label };
  return { ...p, citations: [...p.citations, citation] };
}

export function deleteCitation(p: Project, id: string): Project {
  return { ...p, citations: p.citations.filter(c => !c.builtin && c.id !== id) };
}
