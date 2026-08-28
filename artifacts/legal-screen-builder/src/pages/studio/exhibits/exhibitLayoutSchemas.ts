import { z } from "zod";

export const SourceRef = z.object({
  origin: z.enum(["dictation", "complaint", "discovery", "evidence", "existing_exhibit"]),
  ref: z.string(),
});

export const ClaimField = z.object({
  text: z.string(),
  source: SourceRef.nullable(),
  classification: z.enum(["verified_fact", "observation", "speculation"]),
});

export const HeaderSchema = z.object({
  actor: z.string(),
  category: z.string(),
  badgeNumber: z.string(),
});

// 1. Hero Argument
export const HeroHeadlineLayout = z.object({
  layout: z.literal("hero_headline_argument"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  quote: z.object({
    text: z.string(),
    contextNote: z.string().optional(),
    source: SourceRef,
  }),
  findings: z.array(z.object({
    icon: z.enum(["check", "x", "comment", "shield"]),
    title: z.string(),
    body: ClaimField,
  })).min(3).max(5),
  conclusion: z.object({ lines: z.array(z.string()).max(3) }),
  footerCitations: z.array(z.string()),
});

// 2. Narrative Reveal
export const NarrativeRevealLayout = z.object({
  layout: z.literal("narrative_reveal"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  facts: z.array(z.object({
    icon: z.enum(["person", "comment", "shield", "shieldCheck"]),
    text: ClaimField,
  })).min(2).max(5),
  pivotQuote: z.object({
    leadIn: z.string(),
    text: z.string(),
    highlightedFragment: z.string().optional(),
    source: SourceRef,
  }),
  ctaLabel: z.string().default("Watch What Happens Next"),
  closingParagraph: z.object({
    text: z.string(),
    boldFragment: z.string().optional(),
  }),
  footerCitations: z.array(z.string()),
});

// 3. Question Board
export const QuestionBoardLayout = z.object({
  layout: z.literal("question_board"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  leftColumn: z.object({
    steps: z.array(z.object({
      icon: z.enum(["person", "shield"]),
      label: z.string(),
      quote: ClaimField,
    })).max(2),
    questionBox: z.object({ prompt: z.string(), answer: z.string() }),
  }),
  rightColumn: z.object({
    intro: z.string(),
    checklist: z.array(ClaimField).max(5),
    closingHighlight: z.string(),
  }),
  footerCitations: z.array(z.string()),
});

// 4. Split Screen
export const SplitScreenLayout = z.object({
  layout: z.literal("split_screen"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  leftSide: z.object({ label: z.string(), content: ClaimField }),
  rightSide: z.object({ label: z.string(), content: ClaimField }),
  takeaway: z.object({ text: z.string(), phrasedAsQuestion: z.boolean() }),
  footerCitations: z.array(z.string()),
});

// 5. Timeline
export const TimelineLayout = z.object({
  layout: z.literal("timeline"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  events: z.array(z.object({
    label: z.string(),
    detail: ClaimField,
    timestamp: z.string().optional(),
  })).min(2).max(6),
  conclusion: z.object({ lines: z.array(z.string()).max(3) }),
  footerCitations: z.array(z.string()),
});

// 6. Quote Focus
export const QuoteFocusLayout = z.object({
  layout: z.literal("quote_focus"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  dominantQuote: z.object({ text: z.string(), source: SourceRef }),
  context: z.array(ClaimField).max(4),
  implication: z.object({ text: z.string(), phrasedAsQuestion: z.boolean() }),
  footerCitations: z.array(z.string()),
});

// 7. Evidence Grid
export const EvidenceGridLayout = z.object({
  layout: z.literal("evidence_grid"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  items: z.array(z.object({
    icon: z.enum(["check", "x", "shield", "document"]),
    label: z.string(),
    source: SourceRef,
  })).min(3).max(8),
  conclusion: z.object({ lines: z.array(z.string()).max(2) }),
  footerCitations: z.array(z.string()),
});

// 8. Summary Board
export const SummaryBoardLayout = z.object({
  layout: z.literal("summary_board"),
  header: HeaderSchema,
  headline: z.array(z.string()).min(1).max(2),
  recapPoints: z.array(z.object({
    exhibitRef: z.string(),
    summary: z.string(),
  })).min(2).max(6),
  finalTakeaway: z.object({ lines: z.array(z.string()).max(3) }),
  footerCitations: z.array(z.string()),
});

// 9. Testimony Card — the one layout that does NOT share the 1254×1254
// square-then-letterbox treatment every layout above uses. It's a
// full-native 1920×1080 widescreen title card meant to drop directly into
// a video timeline before/after a testimony or courtroom-footage clip, so
// it has to match the footage's own aspect ratio rather than being
// pillarboxed like every other exhibit type. See ExhibitRenderer.tsx and
// renderAIExhibitSlide.tsx for the native-sizing special case this requires.
export const TestimonyCardLayout = z.object({
  layout: z.literal("testimony_card"),
  speakerName: z.string(),
  cardNumber: z.string(),
  title: z.string(),
  quote: z.string().optional(),
});

export const ExhibitLayout = z.discriminatedUnion("layout", [
  HeroHeadlineLayout,
  NarrativeRevealLayout,
  QuestionBoardLayout,
  SplitScreenLayout,
  TimelineLayout,
  QuoteFocusLayout,
  EvidenceGridLayout,
  SummaryBoardLayout,
  TestimonyCardLayout,
]);

export type ExhibitLayoutType = z.infer<typeof ExhibitLayout>;

export const ExhibitGenerationResponse = z.object({
  selectedType: z.string(),
  content: ExhibitLayout,
  alternativeLayouts: z.array(z.string()).max(3).default([]),
});

export type ExhibitGenerationResponseType = z.infer<typeof ExhibitGenerationResponse>;
