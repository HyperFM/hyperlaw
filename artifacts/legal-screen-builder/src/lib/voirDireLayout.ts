export type SeatPos = { x: number; y: number };
export type Layout = Record<string, SeatPos>;

/** Even rows of `perRow` chairs, filling the seating area — the starting point before the person arranges them. */
export function defaultLayout(seats: number, perRow = 4): Layout {
  const rows = Math.ceil(seats / perRow);
  const out: Layout = {};
  for (let i = 0; i < seats; i++) {
    const r = Math.floor(i / perRow);
    const inRow = Math.min(perRow, seats - r * perRow);
    const c = i % perRow;
    out[String(i + 1)] = { x: (c + 0.5) / inRow, y: (r + 0.5) / rows };
  }
  return out;
}

/** Layout for `seats` chairs, keeping any chair positions already set and placing new ones in the next free spot. */
export function ensureLayout(layout: Layout | undefined, seats: number): Layout {
  const base = layout ?? {};
  if (Object.keys(base).length === seats && Array.from({ length: seats }, (_, i) => String(i + 1)).every(k => base[k])) return base;
  const fresh = defaultLayout(seats);
  const out: Layout = {};
  for (let i = 1; i <= seats; i++) out[String(i)] = base[String(i)] ?? fresh[String(i)];
  return out;
}

/**
 * The number shown on each chair: reading order of where the chairs SIT (top-left to bottom-right),
 * so "Juror 1" is always the chair you'd expect. Chair ids stay stable underneath, so ratings never move.
 */
export function displayNumbers(layout: Layout, rowGap = 0.09): Record<string, number> {
  const ids = Object.keys(layout).sort((a, b) => layout[a].y - layout[b].y || layout[a].x - layout[b].x);
  const rows: string[][] = [];
  let rowY = -1;
  for (const id of ids) {
    if (rows.length === 0 || layout[id].y - rowY > rowGap) { rows.push([id]); rowY = layout[id].y; }
    else rows[rows.length - 1].push(id);
  }
  const out: Record<string, number> = {};
  let n = 1;
  for (const row of rows) {
    row.sort((a, b) => layout[a].x - layout[b].x);
    for (const id of row) out[id] = n++;
  }
  return out;
}

export function clampPos(p: SeatPos, snap = 0.02): SeatPos {
  const s = (v: number) => Math.min(0.88, Math.max(0.12, Math.round(v / snap) * snap));
  return { x: s(p.x), y: s(p.y) };
}
