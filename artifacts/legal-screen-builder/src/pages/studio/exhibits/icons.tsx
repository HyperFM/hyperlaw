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
} as const;

export type ExhibitIconKey = keyof typeof ExhibitIcons;
