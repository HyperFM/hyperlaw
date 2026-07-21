export interface ExhibitTypeConfig {
  id: string;
  name: string;
  layout: string;
  icon: string;
  description: string;
  guidance: string;
}

export const EXHIBIT_TYPES: ExhibitTypeConfig[] = [
  {
    id: "contradiction",
    name: "Contradiction",
    layout: "split_screen",
    icon: "scale",
    description: "Compare two conflicting accounts of the same event.",
    guidance: "Left side = statement/claim, right side = evidence that conflicts with it. Takeaway should pose which version is accurate rather than assert one is false, unless directly sourced.",
  },
  {
    id: "narrative_reveal",
    name: "Narrative Reveal",
    layout: "narrative_reveal",
    icon: "document",
    description: "Show known facts, then reveal a contradictory statement.",
    guidance: "List known facts in the order they were established, then reveal the pivot quote that contradicts them.",
  },
  {
    id: "escalation",
    name: "Escalation",
    layout: "question_board",
    icon: "shield",
    description: "Show a disproportionate response to a minor event.",
    guidance: "Left column shows the minor triggering event and the disproportionate response. Right column poses what justified the gap.",
  },
  {
    id: "policy_comparison",
    name: "Policy Comparison",
    layout: "split_screen",
    icon: "document",
    description: "Compare stated policy against actual conduct.",
    guidance: "Left side = stated policy/rule. Right side = actual conduct. Takeaway highlights the gap.",
  },
  {
    id: "timeline_conflict",
    name: "Timeline Conflict",
    layout: "timeline",
    icon: "arrow",
    description: "Lay out a sequence of events to highlight a conflict in timing.",
    guidance: "Order events strictly chronologically. Conclusion should highlight why the sequence itself matters or where it breaks down.",
  },
  {
    id: "quote_breakdown",
    name: "Quote Breakdown",
    layout: "quote_focus",
    icon: "comment",
    description: "Center one statement and unpack its implications.",
    guidance: "The quote should dominate. Context explains what was known before the quote was said. Implication should be phrased as a question unless directly sourced as fact.",
  },
  {
    id: "evidence_stack",
    name: "Evidence Stack",
    layout: "evidence_grid",
    icon: "check",
    description: "Show multiple independent pieces of evidence supporting one point.",
    guidance: "List every independent piece of evidence supporting one point, using check icons. Headline should reflect convergence.",
  },
  {
    id: "missing_investigation",
    name: "Missing Investigation",
    layout: "evidence_grid",
    icon: "x",
    description: "Show steps that were never taken during an investigation.",
    guidance: "Items represent things that were NOT done/checked, using 'x' icons. Headline poses a question about the adequacy of the investigation.",
  },
  {
    id: "question_analysis",
    name: "Question Analysis",
    layout: "question_board",
    icon: "question",
    description: "Walk from an event through a response to a central question.",
    guidance: "Event → response → central question. Right column checklist should show what did NOT justify the response.",
  },
  {
    id: "watch_this_moment",
    name: "Watch This Moment",
    layout: "narrative_reveal",
    icon: "play",
    description: "Set up context right before a critical video clip plays.",
    guidance: "Facts block sets up what's about to be seen. CTA should explicitly cue the viewer to watch the upcoming clip.",
  },
];
