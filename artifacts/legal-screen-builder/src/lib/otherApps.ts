/** The apps shown under Profile → Other apps. The owner edits this list; nothing else needs to change. */
export interface OtherApp { name: string; tagline: string; url: string }

export const OTHER_APPS: OtherApp[] = [
  { name: "HyperFM", tagline: "Music by Hyper Modula — listen, vote and follow along.", url: "https://hyperfm.site" },
];
