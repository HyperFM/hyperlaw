// Foundation
export { HyperLawTheme } from "./theme";
export type { HyperLawThemeKey } from "./theme";
export { ExhibitIcons } from "./icons";
export type { ExhibitIconKey } from "./icons";
export { EXHIBIT_TYPES } from "./exhibitTypes";
export type { ExhibitTypeConfig } from "./exhibitTypes";
export {
  SourceRef, ClaimField, HeaderSchema,
  HeroHeadlineLayout, NarrativeRevealLayout, QuestionBoardLayout,
  SplitScreenLayout, TimelineLayout, QuoteFocusLayout,
  EvidenceGridLayout, SummaryBoardLayout,
  ExhibitLayout, ExhibitGenerationResponse,
} from "./exhibitLayoutSchemas";
export type { ExhibitLayoutType, ExhibitGenerationResponseType } from "./exhibitLayoutSchemas";

// Layout components
export { HeroHeadlineArgument } from "./HeroHeadlineArgument";
export { NarrativeReveal } from "./NarrativeReveal";
export { QuestionBoard } from "./QuestionBoard";
export { SplitScreen } from "./SplitScreen";
export { Timeline } from "./Timeline";
export { QuoteFocus } from "./QuoteFocus";
export { EvidenceGrid } from "./EvidenceGrid";
export { SummaryBoard } from "./SummaryBoard";

// Composed exhibit UI (generator pipeline)
export { ExhibitRenderer } from "./ExhibitRenderer";
export { ExhibitGeneratorPanel } from "./ExhibitGeneratorPanel";
export { ExhibitReviewPanel } from "./ExhibitReviewPanel";
