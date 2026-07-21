export const HyperLawTheme = {
  orange: "#E8611A",
  white: "#F2F0EC",
  black: "#0A0A0A",
  gray: "#9A9A9A",
  grayLight: "#D0D0D0",
  divider: "#3A3A3A",
} as const;

export type HyperLawThemeKey = keyof typeof HyperLawTheme;
