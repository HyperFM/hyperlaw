import { Project, Screen } from "../types";

// ─── Domain types (UI-stable — engine can be swapped) ─────────────────────────

export type InsightType = "strength" | "weakness" | "question" | "suggestion" | "concept";
export type CardType = "fact" | "concept" | "evidence" | "question" | "why" | "strengthen";

export interface TutorInsight {
  id: string;
  type: InsightType;
  title: string;
  body: string;
}

export interface LearningCard {
  id: string;
  cardType: CardType;
  front: string;
  back: string;
}

// ─── Service interface ────────────────────────────────────────────────────────
// Replace the implementation below with an AI-backed version without changing
// any call sites in the UI.

export interface TutorService {
  getInsights(project: Project): TutorInsight[];
  getLearningCards(project: Project): LearningCard[];
}

// ─── Static implementation (Question-tree / keyword engine) ──────────────────

function textFromScreens(screens: Screen[]): string {
  return screens
    .flatMap(s => s.blocks.flatMap(b => Object.values(b.data)))
    .join(" ")
    .toLowerCase();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function insight(type: InsightType, title: string, body: string): TutorInsight {
  return { id: uid(), type, title, body };
}

function card(cardType: CardType, front: string, back: string): LearningCard {
  return { id: uid(), cardType, front, back };
}

export const staticTutorService: TutorService = {
  getInsights(project: Project): TutorInsight[] {
    const results: TutorInsight[] = [];
    const screens = project.screens;
    const evidence = project.evidence;
    const allText = textFromScreens(screens);
    const typeCount = new Map<string, number>();

    for (const s of screens) {
      typeCount.set(s.screenType, (typeCount.get(s.screenType) ?? 0) + 1);
    }

    if (screens.length === 0) {
      results.push(
        insight("suggestion", "Start building your case", "Add your first screen in the Build tab. The Tutor will immediately start reading your facts and teaching from them.")
      );
      return results;
    }

    // Strength signals
    if (typeCount.has("contradiction")) {
      results.push(
        insight("strength", "You have a contradiction on record", "Contradiction screens are among the most powerful tools in a civil rights case. Courts and juries respond strongly when statements provably conflict.")
      );
    }
    if (typeCount.has("admission")) {
      results.push(
        insight("strength", "You captured an admission", "An admission establishes prior knowledge or awareness. This can be decisive — it removes the defense that they 'didn't know.'")
      );
    }
    if (evidence.length >= 3) {
      results.push(
        insight("strength", `${evidence.length} pieces of evidence in your vault`, "Strong cases corroborate the same facts through multiple independent sources. You're building that foundation.")
      );
    }

    // Weakness / gap signals
    if (typeCount.has("contradiction") && evidence.filter(e => e.type === "bodycam").length === 0) {
      results.push(
        insight("weakness", "No bodycam evidence linked yet", "Your contradiction screen is powerful — but bodycam footage with a timestamp locks the argument shut. If footage exists, add it to the Evidence Vault.")
      );
    }
    if (!typeCount.has("policy_violation") && /policy|protocol|procedure|required/.test(allText)) {
      results.push(
        insight("suggestion", "Your facts suggest a policy violation", "Your screens mention policy or procedure language. Consider building a Policy Violation screen — courts respond well to documented policy departures.")
      );
    }
    if (!typeCount.has("admission") && /knew|aware|notice|told/.test(allText)) {
      results.push(
        insight("suggestion", "Watch for admission language", "Your screens contain phrases like 'knew' or 'aware.' If any officer or official acknowledged a fact, that may be an admission worth its own screen.")
      );
    }
    if (!typeCount.has("prior_incident") && /before|prior|previous|again|history/.test(allText)) {
      results.push(
        insight("suggestion", "Consider a Prior Incident screen", "Your facts reference something happening before or again. Prior incidents strengthen a pattern-of-conduct argument significantly.")
      );
    }
    if (project.citations.length === 0) {
      results.push(
        insight("suggestion", "Add legal citations", "Open the Legal Library in the Build tab and attach citations to your screens. Named cases — like Graham v. Connor — tell the court you know the standard.")
      );
    }

    // Concept education
    results.push(
      insight("concept", "Why facts matter more than labels", "Courts don't rule on 'bad behavior' — they rule on whether specific facts meet legal standards. Every screen should answer: what exactly happened, and what does that prove?")
    );
    if (typeCount.has("policy_violation")) {
      results.push(
        insight("concept", "Policy violations and § 1983", "Under 42 U.S.C. § 1983, a policy violation alone isn't always enough — you must show the policy caused a constitutional deprivation. Your policy screen sets the foundation; the other screens complete it.")
      );
    }

    // Questions to push thinking
    results.push(
      insight("question", "What evidence have you not secured yet?", "Bodycam, dispatch logs, agency records, and reports can be destroyed or lost. If you haven't filed a litigation hold letter or preservation demand, consider doing so immediately.")
    );
    if (screens.length >= 3) {
      results.push(
        insight("question", "Do your screens tell a complete story?", `You have ${screens.length} screens. Imagine presenting them in order — does a viewer understand what happened, who is responsible, and why it matters? If not, a narrative screen or timeline may help.`)
      );
    }

    return results;
  },

  getLearningCards(project: Project): LearningCard[] {
    const cards: LearningCard[] = [];
    const screens = project.screens;
    const evidence = project.evidence;

    // Concept cards always relevant
    cards.push(
      card("concept", "What is a § 1983 claim?", "42 U.S.C. § 1983 allows individuals to sue state actors who violated their constitutional rights under color of law. It requires: (1) a constitutional right was violated, (2) by someone acting under color of state law."),
      card("concept", "What does 'under color of law' mean?", "It means the person was acting in their official capacity — as a police officer, government employee, or official — even if they were abusing that authority."),
      card("why", "Why do contradictions matter?", "If someone says A at one point and B at another — and both can't be true — one statement is false. The question then becomes: which one? And why would they lie? That's the moment jurors start paying attention.")
    );

    // Cards based on screen types
    for (const screen of screens.slice(0, 5)) {
      if (screen.screenType === "contradiction") {
        cards.push(
          card("fact", `Contradiction: ${screen.title}`, "A contradiction exists when two statements or pieces of evidence cannot both be true. Document the source, the exact language, and what makes them conflict."),
          card("question", "Who benefits from this contradiction being ignored?", "When analyzing a contradiction, ask who gains if the conflict is never examined. That often points to motive — and motive strengthens your argument.")
        );
      }
      if (screen.screenType === "admission") {
        cards.push(
          card("fact", `Admission: ${screen.title}`, "An admission is when a party acknowledges a fact that damages their own position — knowledge, awareness, or prior notice. Document the exact words and the context."),
          card("why", "Why does prior knowledge matter legally?", "If they knew about a risk or condition and failed to act, it defeats the 'we didn't know' defense. In civil rights cases, deliberate indifference often hinges on what they knew and when.")
        );
      }
      if (screen.screenType === "policy_violation") {
        cards.push(
          card("fact", `Policy Violation: ${screen.title}`, "A policy violation screen shows the gap between what was required and what actually happened. Always name the specific policy and section if possible."),
          card("strengthen", "What would strengthen a policy violation?", "Show: (1) the written policy, (2) training records proving they knew the policy, (3) bodycam or reports showing the deviation, (4) the consequence of that deviation.")
        );
      }
    }

    // Evidence-based cards
    if (evidence.length > 0) {
      cards.push(
        card("evidence", `Your vault has ${evidence.length} item(s)`, "Evidence is most powerful when it's corroborated — the same fact shown through multiple independent sources. Bodycam + report + witness = hard to deny."),
        card("strengthen", "How do you make evidence harder to challenge?", "Chain of custody, timestamps, original file formats, and request confirmations all make evidence harder to dismiss. If you got something digitally, screenshot the metadata.")
      );
    }

    // Universal reasoning cards
    cards.push(
      card("concept", "What is deliberate indifference?", "A legal standard meaning someone knew of and consciously disregarded a serious risk. Used in § 1983 cases involving failure to protect, medical care denial, and supervisor liability."),
      card("question", "What additional evidence could exist that you haven't found yet?", "Think about: dispatch CAD records, radio communications, digital access logs, security footage, officer personnel files, and prior complaint records (FOIA-able)."),
      card("why", "Why does legal significance matter on every screen?", "Facts without legal meaning don't move courts. Every screen should answer: so what? What rule or standard does this violate, and what remedy does that justify?")
    );

    return cards;
  },
};
