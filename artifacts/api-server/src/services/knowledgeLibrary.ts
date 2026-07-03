/**
 * Knowledge Library service — library-first routing for AI analysis.
 *
 * Searches the knowledge_library table using PostgreSQL full-text search
 * (plainto_tsquery) before falling through to Claude, so admin-curated
 * content takes priority and reduces token usage.
 */
import { pool } from "@workspace/db";

export interface KnowledgeEntry {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  keywords: string[];
  jurisdiction: string | null;
  source: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Stop words excluded from keyword extraction
const STOP = new Set([
  "the","and","for","was","that","this","with","have","from","they","will",
  "your","what","when","where","which","how","are","not","but","had","his",
  "her","she","him","you","our","about","after","also","been","its","were",
]);

function extractKeywords(text: string, maxWords = 12): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP.has(w))
    .slice(0, maxWords)
    .join(" ");
}

/**
 * Search the knowledge library using PostgreSQL full-text search.
 * Returns up to `limit` active entries ranked by relevance.
 * Falls back to empty array on any error (never blocks the AI call).
 */
export async function searchLibrary(opts: {
  query: string;
  category?: string;
  jurisdiction?: string;
  limit?: number;
}): Promise<KnowledgeEntry[]> {
  const { query, category, jurisdiction, limit = 3 } = opts;

  const keywords = extractKeywords(query);
  if (!keywords.trim()) return [];

  try {
    const params: (string | number | boolean)[] = [keywords, limit];
    let idx = 3;

    const categoryClause = category ? `AND category = $${idx++}` : "";
    if (category) params.splice(2, 0, category);

    const jurisdictionClause = jurisdiction
      ? `AND (jurisdiction IS NULL OR jurisdiction ILIKE $${idx++})`
      : "";
    if (jurisdiction) params.push(`%${jurisdiction}%`);

    // FTS vector includes title, summary, body AND stored keywords/tags arrays
    const FTS_VECTOR = `
      to_tsvector('english',
        coalesce(title,'') || ' ' ||
        coalesce(summary,'') || ' ' ||
        coalesce(body,'') || ' ' ||
        coalesce(keywords::text,'') || ' ' ||
        coalesce(tags::text,'')
      )`;

    const { rows } = await pool.query<KnowledgeEntry>(
      `SELECT id, title, summary, body, category, tags, keywords, jurisdiction, source,
              is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_library
       WHERE is_active = true
         ${categoryClause}
         ${jurisdictionClause}
         AND ${FTS_VECTOR} @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(${FTS_VECTOR}, plainto_tsquery('english', $1)) DESC
       LIMIT $2`,
      params,
    );
    return rows;
  } catch (err) {
    console.error("[knowledgeLibrary] search error", err);
    return [];
  }
}

/**
 * Format matched library entries into a context block for injection
 * into the Claude system prompt.
 */
export function formatLibraryContext(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";
  const sections = entries.map(e =>
    `### ${e.title}${e.source ? ` (${e.source})` : ""}\n${e.body}`,
  );
  return `RELEVANT LEGAL KNOWLEDGE FROM HYPERLAW LIBRARY:\n\n${sections.join("\n\n")}`;
}
