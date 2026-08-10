import React from "react";

export const ExhibitIcons = {
  check: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  ),
  x: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
  comment: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color}>
      <path d="M4 4h16v12H8l-4 4V4z" />
      <circle cx="9" cy="10" r="1" fill="black" />
      <circle cx="12" cy="10" r="1" fill="black" />
      <circle cx="15" cy="10" r="1" fill="black" />
    </svg>
  ),
  shield: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
    </svg>
  ),
  shieldCheck: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  person: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  question: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4" />
      <circle cx="12" cy="17" r="0.5" fill={color} />
    </svg>
  ),
  document: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M6 2h9l5 5v15H6V2z" />
      <path d="M9 12h6M9 15h6" />
      <circle cx="17" cy="18" r="3" />
      <path d="M19.5 20.5L22 23" />
    </svg>
  ),
  arrow: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  ),
  scale: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 3v18M6 7l-3 5a3 3 0 006 0l-3-5zM18 7l-3 5a3 3 0 006 0l-3-5zM5 21h14M9 21h6" />
      <path d="M4 7h16" />
    </svg>
  ),
  play: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color}>
      <path d="M8 5v14l11-7-11-7z" />
    </svg>
  ),
  // The five below match names the exhibit-generation system prompt actually
  // instructs the AI to use (mic/speech/camera/clock/calendar) — they didn't
  // exist here before, so the AI's own icon choices threw "not a function"
  // at render time every time it picked one of these, confirmed via the
  // debug log's "[ERR] exhibit preview failed" entries.
  mic: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0" />
      <path d="M12 18v4M8 22h8" />
    </svg>
  ),
  speech: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 16l-3 4v-4" />
    </svg>
  ),
  camera: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  clock: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  calendar: (color: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
} as const;

export type ExhibitIconKey = keyof typeof ExhibitIcons;

/** Safe accessor — falls back to a generic icon instead of throwing if
 *  content (AI-generated or already saved before this map grew) names an
 *  icon that isn't in ExhibitIcons. */
export function renderExhibitIcon(key: string, color: string): React.ReactNode {
  const fn = ExhibitIcons[key as ExhibitIconKey];
  return (fn ?? ExhibitIcons.check)(color);
}
