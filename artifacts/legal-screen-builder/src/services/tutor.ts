import { Incident, HLCase } from "../types";
// TutorInsight / TutorAnalysis are defined once in lib/aiApi.ts (the canonical
// client-side mirror of the server AI shapes). Import + re-export them here so the
// static fallback service and existing call sites share ONE definition (no drift).
import type { TutorInsight, TutorAnalysis } from "../lib/aiApi";
export type { TutorInsight, TutorAnalysis };

// ─── Service interface ────────────────────────────────────────────────────────

export interface TutorService {
  analyzeIncident(incident: Incident): TutorAnalysis;
  analyzeCase(hlCase: HLCase, incidents: Incident[]): TutorAnalysis;
}

// ─── Static implementation (keyword-based, swappable for Claude) ──────────────

const PATTERNS: { re: RegExp; notice: string }[] = [
  { re: /\b(officer|police|cop|deputy|sheriff|agent)\b/i, notice: "This incident involves a law enforcement officer. The Fourth and Fourteenth Amendments may be relevant to what happened." },
  { re: /\b(fired|terminated|laid off|dismissed)\b/i, notice: "If this involves employment termination, there may be notice and due process considerations worth examining." },
  { re: /\b(search|searched|seized|seizure)\b/i, notice: "A search or seizure may implicate Fourth Amendment protections requiring a warrant or established exception." },
  { re: /\b(video|bodycam|camera|recording|footage)\b/i, notice: "You mentioned video or recording. Preserve this evidence immediately — request it in writing to create a paper trail." },
  { re: /\b(denied|refused|blocked|prevented)\b/i, notice: "If you were denied access to something you were entitled to, that may raise due process or equal protection issues." },
  { re: /\b(threatened|threat|intimidat)\b/i, notice: "Threats or intimidation may be relevant to establishing the nature of the conduct and its effect on you." },
  { re: /\b(witness|witnesses|bystander|saw me|saw him|saw her)\b/i, notice: "You mentioned witnesses. Their contact information and statements are critical — reach out to preserve their account now." },
  { re: /\b(report|complaint|filed|written|document)\b/i, notice: "You mentioned a written document or report. Obtain a copy immediately and preserve it as evidence." },
  { re: /\b(prior|before|history|pattern|again|previous)\b/i, notice: "Prior incidents or patterns can be important — they show this was not an isolated mistake but part of ongoing conduct." },
];

const ALL_QUESTIONS: string[] = [
  "Who specifically did this to you — their full name, title, or badge number if you know it?",
  "Exactly when did this happen — the date, time, and location?",
  "Were there any witnesses present? Do you have their names or contact information?",
  "Was anything recorded — video, audio, photos, or written documentation at the time?",
  "Had anything like this happened before, either to you or to others you know of?",
  "Did you report this to anyone at the time? If so, who and when?",
  "Is there any paperwork — reports, forms, emails — that exists from this incident?",
  "What outcome were you seeking at the time, and did you receive it?",
  "Were there any other incidents connected to this one you have not yet described?",
  "What is the clearest thing this person did that you believe was wrong?",
];

function pickQuestions(description: string): string[] {
  const lower = description.toLowerCase();
  return ALL_QUESTIONS.filter(q => {
    if (/witness|bystander/.test(lower) && /witness/.test(q.toLowerCase())) return false;
    if (/video|bodycam|camera|recording/.test(lower) && /recorded/.test(q.toLowerCase())) return false;
    if (/report|complaint|filed|written/.test(lower) && /paperwork/.test(q.toLowerCase())) return false;
    return true;
  }).slice(0, 5);
}

export const staticTutorService: TutorService = {
  analyzeIncident(incident: Incident): TutorAnalysis {
    const desc = incident.description;
    const wordCount = desc.trim().split(/\s+/).filter(Boolean).length;

    const notices: TutorInsight[] = PATTERNS
      .filter(p => p.re.test(desc))
      .slice(0, 3)
      .map(p => ({ type: "notice" as const, text: p.notice }));

    const keyPoints: TutorInsight[] = [];
    if (wordCount < 80) {
      keyPoints.push({ type: "question", text: "Your description is brief. Try to add more detail — even small details like exact words said, exact sequence of events, or who else was present can matter significantly." });
    } else if (wordCount < 200) {
      keyPoints.push({ type: "gap", text: "Your description is a good start. Look for gaps: exact words spoken, the precise order of events, who gave which order, and any badge numbers or names you haven't yet recorded." });
    } else {
      keyPoints.push({ type: "gap", text: "Your description is detailed. Check for any remaining gaps: exact timestamps, full names and badge numbers, whether anything was recorded, and whether you reported this in writing." });
    }

    return {
      overview: `You've described an incident: "${incident.title}". The Tutor will help you think through what's important, what questions remain, and what to do next.`,
      insights: [...keyPoints, ...notices],
      guidingQuestions: pickQuestions(desc),
    };
  },

  analyzeCase(hlCase: HLCase, incidents: Incident[]): TutorAnalysis {
    const count = incidents.length;
    const totalWords = incidents.reduce((n, i) => n + i.description.trim().split(/\s+/).filter(Boolean).length, 0);

    const seenNotices = new Set<string>();
    const notices: TutorInsight[] = [];
    for (const inc of incidents) {
      for (const p of PATTERNS) {
        if (p.re.test(inc.description) && !seenNotices.has(p.notice)) {
          seenNotices.add(p.notice);
          notices.push({ type: "notice", text: p.notice });
        }
      }
    }

    const combined = incidents.map(i => i.description).join(" ");

    return {
      overview: `Case: "${hlCase.title}" — ${count} incident${count !== 1 ? "s" : ""}, approximately ${totalWords} words of description total. The Tutor reads across all incidents to help you find patterns.`,
      insights: [
        count > 1
          ? { type: "gap", text: "Review each incident for documentation gaps: every incident should have its own date, location, officer names or badge numbers, and a specific factual account. A gap in one incident can affect the whole case record." }
          : { type: "gap", text: "Only one incident is documented so far. Are there related events — before or after — that should be recorded as separate incidents?" },
        ...notices.slice(0, 3),
      ],
      guidingQuestions: pickQuestions(combined),
    };
  },
};
