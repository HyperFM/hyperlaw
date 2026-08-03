import type { CapacitorConfig } from "@capacitor/cli";

// The app loads the live site directly rather than a bundled offline copy —
// HyperLaw needs a live backend for auth, cases, and AI features, so a
// purely offline WebView wouldn't work anyway. dist/public still ships in
// the bundle as Capacitor's required local webDir, but server.url below
// takes priority at runtime.
const config: CapacitorConfig = {
  appId: "com.hyperlaw.app",
  appName: "HyperLaw",
  webDir: "dist/public",
  server: {
    url: "https://hyperlaw.site",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
