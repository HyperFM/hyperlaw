import type { HLCase, Party, TimelineEvent } from "../types";
import { assignNickname } from "./nicknames";

export interface ConfirmedFacts {
  parties: Array<{ name: string; role?: string; isOfficial?: boolean; agency?: string | null }>;
  events: Array<{ when?: string | null; what: string }>;
  court?: string | null;
  story?: string;
}

/** Folds facts the person CONFIRMED (intake chat review, or a chat "add this to my case?" card) into the case. */
export function mergeFactsIntoCase(hlCase: HLCase, facts: ConfirmedFacts): HLCase {
  const used: string[] = hlCase.parties.map(p => p.nickname);
  const existing = new Set(hlCase.parties.map(p => `${p.firstName} ${p.lastName}`.trim().toLowerCase()));
  const newParties: Party[] = [];
  for (const p of facts.parties) {
    if (existing.has(p.name.trim().toLowerCase())) continue;
    const tokens = p.name.trim().split(/\s+/).filter(Boolean);
    const { word, emoji } = assignNickname(used);
    used.push(word);
    const isOfficial = !!p.isOfficial;
    newParties.push({
      id: crypto.randomUUID(),
      firstName: tokens[0] || p.name || "Person",
      lastName: tokens.slice(1).join(" "),
      type: isOfficial ? "official" : "civilian",
      nickname: word,
      nicknameEmoji: emoji,
      ...(isOfficial ? { agency: (p.agency ?? "").trim() || undefined, title: (p.role ?? "").trim() || undefined } : {}),
    });
  }
  const newEvents: TimelineEvent[] = facts.events.map((ev, i) => ({
    id: crypto.randomUUID(),
    title: (ev.when ?? "").trim() || `Event ${hlCase.timeline.length + i + 1}`,
    description: ev.what,
    order: hlCase.timeline.length + i,
  }));
  return {
    ...hlCase,
    parties: [...hlCase.parties, ...newParties],
    timeline: [...hlCase.timeline, ...newEvents],
    story: facts.story ? [hlCase.story, facts.story].filter(s => s?.trim()).join("\n\n") : hlCase.story,
    jurisdiction: hlCase.jurisdiction?.trim() ? hlCase.jurisdiction : (facts.court ?? hlCase.jurisdiction),
  };
}

type NextUp = NonNullable<import("../types").StructuredCase["nextUp"]>;

/** A fresh Index build must not wipe deadlines the person's chat added: carry those over (and de-duplicate). */
export function keepChatItems(prev: NextUp | undefined, next: NextUp | undefined): NextUp {
  const kept = (prev ?? []).filter(i => i.origin === "chat");
  const fresh = (next ?? []).filter(n => !kept.some(k => k.text === n.text && k.dueDate === n.dueDate));
  return [...kept, ...fresh];
}

/** Adds a chat-computed deadline to the case's Index "Do next" list. */
export function addChatDeadline(hlCase: HLCase, d: { filing: string; dueDate: string; rule?: string }): HLCase {
  const item = { kind: "todo" as const, text: d.filing, dueDate: d.dueDate, note: d.rule, origin: "chat" as const };
  const sc = hlCase.structuredCase;
  const existing = sc?.nextUp ?? [];
  if (existing.some(i => i.text === item.text && i.dueDate === item.dueDate)) return hlCase;
  return {
    ...hlCase,
    structuredCase: sc
      ? { ...sc, nextUp: [item, ...existing] }
      : { executiveSummary: "", clouds: [], keyFacts: [], claims: [], importantQuotes: [], nextUp: [item], organizedAt: Date.now() },
  };
}
