import { LegalItem } from "./types";

export const LEGAL_LIBRARY: LegalItem[] = [
  // ── Federal Statutes ──────────────────────────────────────────────────────
  {
    id: "42usc1983",
    category: "federal",
    subcategory: "Civil Rights",
    name: "Civil Rights Act — §1983",
    citation: "42 U.S.C. §1983",
    summary: "Creates a private right of action against any person who, under color of state law, deprives another of federally protected rights.",
    elements: [
      "Defendant acted under color of state law",
      "Conduct deprived plaintiff of a constitutional or federal right",
      "Causation — the deprivation resulted from the conduct",
    ],
    keywords: ["civil rights", "color of law", "state actor", "§1983", "deprivation", "rights violation"],
    notes: "The foundation of most police misconduct and government civil rights lawsuits.",
  },
  {
    id: "4thamend",
    category: "federal",
    subcategory: "Constitution",
    name: "4th Amendment — Unreasonable Search & Seizure",
    citation: "U.S. Const. amend. IV",
    summary: "Protects against unreasonable searches and seizures; requires probable cause for warrants.",
    elements: [
      "Government action / state actor",
      "Search or seizure occurred",
      "No valid warrant, or warrant lacked probable cause",
      "OR warrantless search lacked a recognized exception",
    ],
    keywords: ["search", "seizure", "warrant", "probable cause", "stop", "detain", "arrest", "unreasonable"],
    notes: "Applies to arrests, stops, searches of persons, homes, and property.",
  },
  {
    id: "14thamend_due",
    category: "federal",
    subcategory: "Constitution",
    name: "14th Amendment — Due Process",
    citation: "U.S. Const. amend. XIV, §1",
    summary: "Guarantees no state shall deprive any person of life, liberty, or property without due process of law.",
    elements: [
      "Deprivation of life, liberty, or property interest",
      "Government action",
      "No adequate procedural protection, OR conduct shocks the conscience (substantive)",
    ],
    keywords: ["due process", "liberty", "property", "life", "notice", "hearing", "arbitrary", "conscience"],
    notes: "Covers both procedural due process (fair process) and substantive due process (arbitrary government action).",
  },
  {
    id: "1stAmend",
    category: "federal",
    subcategory: "Constitution",
    name: "1st Amendment Retaliation",
    citation: "U.S. Const. amend. I; see also Hartman v. Moore, 547 U.S. 250 (2006)",
    summary: "Government may not retaliate against a person for exercising First Amendment rights.",
    elements: [
      "Plaintiff engaged in constitutionally protected activity",
      "Defendant took adverse action against plaintiff",
      "Protected activity was a substantial motivating factor",
    ],
    keywords: ["retaliation", "free speech", "protest", "recording", "first amendment", "motivated by", "chilling"],
  },
  {
    id: "monell",
    category: "federal",
    subcategory: "Civil Rights",
    name: "Monell — Municipal Liability",
    citation: "Monell v. Dep't of Social Servs., 436 U.S. 658 (1978)",
    summary: "A local government can be liable under §1983 only when an official policy or custom causes the constitutional violation.",
    elements: [
      "Official policy or widespread custom",
      "Policymaker promulgated or ratified it",
      "Policy / custom was the moving force behind the violation",
    ],
    keywords: ["policy", "custom", "practice", "department", "municipality", "official", "ratification", "widespread", "failure to train"],
    notes: "Governments cannot be held liable under respondeat superior — the policy itself must cause the harm.",
  },

  // ── Use of Force ──────────────────────────────────────────────────────────
  {
    id: "graham",
    category: "case_law",
    subcategory: "Use of Force",
    name: "Graham v. Connor — Objective Reasonableness",
    citation: "Graham v. Connor, 490 U.S. 386 (1989)",
    summary: "Excessive force claims by free citizens are analyzed under the Fourth Amendment's objective reasonableness standard.",
    elements: [
      "Severity of the crime at issue",
      "Whether the suspect posed an immediate threat",
      "Whether the suspect was actively resisting or evading arrest",
    ],
    keywords: ["excessive force", "objective reasonableness", "force", "threat", "resisting", "fleeing", "officer"],
    notes: "The three Graham factors are the starting point for all excessive force analysis.",
  },
  {
    id: "garner",
    category: "case_law",
    subcategory: "Use of Force",
    name: "Tennessee v. Garner — Deadly Force",
    citation: "Tennessee v. Garner, 471 U.S. 1 (1985)",
    summary: "Deadly force to prevent escape is only reasonable if the officer has probable cause to believe the suspect poses a significant threat.",
    elements: [
      "Suspect posed a significant threat of death or serious physical harm to officer or others",
      "Warning given if feasible",
      "No other reasonable alternative",
    ],
    keywords: ["deadly force", "lethal", "shooting", "firearm", "fleeing felon", "threat", "significant threat"],
  },

  // ── Deliberate Indifference ───────────────────────────────────────────────
  {
    id: "deliberate_indiff",
    category: "federal",
    subcategory: "Civil Rights",
    name: "Deliberate Indifference",
    citation: "See Farmer v. Brennan, 511 U.S. 825 (1994); City of Canton v. Harris, 489 U.S. 378 (1989)",
    summary: "A government actor is deliberately indifferent when they know of and disregard an excessive risk to health or safety.",
    elements: [
      "Subjective knowledge of a substantial risk",
      "Conscious disregard of that risk",
      "Causal connection to harm",
    ],
    keywords: ["deliberate indifference", "knew", "knowledge", "disregard", "risk", "serious medical need", "failure to act", "ignored"],
    notes: "Used in failure-to-train claims, medical care denial, and conditions of confinement.",
  },

  // ── Truthfulness / Evidence ───────────────────────────────────────────────
  {
    id: "brady",
    category: "case_law",
    subcategory: "Evidence",
    name: "Brady — Evidence Disclosure",
    citation: "Brady v. Maryland, 373 U.S. 83 (1963)",
    summary: "Prosecutors must disclose all material exculpatory evidence to the defense.",
    elements: [
      "Evidence is favorable to the defendant (exculpatory or impeaching)",
      "Evidence was suppressed by the prosecution",
      "Prejudice resulted — reasonable probability of different outcome",
    ],
    keywords: ["brady", "exculpatory", "disclosure", "suppress", "withhold", "hide", "evidence", "prosecution"],
  },
  {
    id: "false_report",
    category: "federal",
    subcategory: "Federal Statutes",
    name: "False Statements — Federal",
    citation: "18 U.S.C. §1001",
    summary: "Makes it a federal crime to knowingly make any false, fictitious, or fraudulent statement in a federal matter.",
    elements: [
      "Statement was false, fictitious, or fraudulent",
      "Made knowingly and willfully",
      "Made within the jurisdiction of a federal department or agency",
    ],
    keywords: ["false", "lie", "fabricate", "fabrication", "false report", "perjury", "false statement", "cover up"],
  },

  // ── Failure to Intervene ──────────────────────────────────────────────────
  {
    id: "bystander",
    category: "federal",
    subcategory: "Civil Rights",
    name: "Failure to Intervene",
    citation: "See Yang v. Hardin, 37 F.3d 282 (7th Cir. 1994); Byrd v. Clark, 783 F.2d 1002 (11th Cir. 1986)",
    summary: "Officers have a duty to intervene when they know another officer is using excessive force and have a realistic opportunity to do so.",
    elements: [
      "Constitutional violation was committed by a fellow officer",
      "Defendant officer knew or had reason to know",
      "Had a realistic opportunity to intervene",
      "Failed to act",
    ],
    keywords: ["bystander", "watched", "stood by", "did nothing", "failed to intervene", "other officer", "witness", "present"],
    notes: "Increasingly applied nationwide. Failure to stop a violation can be as actionable as committing it.",
  },

  // ── State / Agency Policies ───────────────────────────────────────────────
  {
    id: "deescalation",
    category: "agency",
    subcategory: "Police Policies",
    name: "De-escalation Policy",
    citation: "Agency General Order (jurisdiction-specific)",
    summary: "Officers must attempt to de-escalate tense situations through communication and non-force means before resorting to physical force.",
    elements: [
      "Situation allowed time for de-escalation",
      "Officer failed to use verbal commands, warnings, or distance",
      "Force was used without exhausting available alternatives",
    ],
    keywords: ["de-escalation", "verbal", "communication", "alternatives", "tactics", "waiting", "calm", "backing away"],
  },
  {
    id: "body_cam_policy",
    category: "agency",
    subcategory: "Police Policies",
    name: "Body-Worn Camera Policy",
    citation: "Agency BWC Policy (jurisdiction-specific)",
    summary: "Officers are required to activate body-worn cameras during specified encounters and to preserve recordings.",
    elements: [
      "Encounter fell within required activation category",
      "Camera was not activated, was deactivated early, or footage was not preserved",
      "No authorized exception applies",
    ],
    keywords: ["bodycam", "body camera", "bwc", "activate", "deactivate", "failed to record", "footage", "missing video"],
  },
  {
    id: "use_of_force_report",
    category: "agency",
    subcategory: "Police Policies",
    name: "Use-of-Force Reporting Requirement",
    citation: "Agency UOF Policy (jurisdiction-specific)",
    summary: "Officers are required to file a use-of-force report whenever force is used above a specified threshold.",
    elements: [
      "Force was used above the reporting threshold",
      "Officer failed to complete required report",
      "OR report contained material misrepresentations",
    ],
    keywords: ["use of force", "report", "failed to report", "unreported", "omitted", "inaccurate report", "false report"],
  },

  // ── Key Standards ─────────────────────────────────────────────────────────
  {
    id: "qualified_immunity",
    category: "case_law",
    subcategory: "Immunity",
    name: "Qualified Immunity Standard",
    citation: "Harlow v. Fitzgerald, 457 U.S. 800 (1982); Pearson v. Callahan, 555 U.S. 223 (2009)",
    summary: "Government officials are shielded from liability unless they violated a clearly established statutory or constitutional right.",
    elements: [
      "Was there a constitutional violation?",
      "Was the right clearly established at the time?",
      "Would a reasonable officer have known the conduct was unlawful?",
    ],
    keywords: ["qualified immunity", "clearly established", "immunity", "shield", "good faith", "reasonable officer"],
    notes: "Knowing the QI analysis is critical — you must identify specific prior cases that clearly establish the right.",
  },
];

export const LEGAL_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "federal", label: "Federal" },
  { id: "case_law", label: "Case Law" },
  { id: "agency", label: "Agency Policy" },
];

export function searchLaws(query: string): LegalItem[] {
  if (!query.trim()) return LEGAL_LIBRARY;
  const q = query.toLowerCase();
  return LEGAL_LIBRARY.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.citation.toLowerCase().includes(q) ||
    item.summary.toLowerCase().includes(q) ||
    item.keywords.some(k => k.includes(q))
  );
}

export function recommendLaws(text: string): LegalItem[] {
  const t = text.toLowerCase();
  return LEGAL_LIBRARY.filter(item =>
    item.keywords.some(k => t.includes(k))
  ).slice(0, 4);
}
