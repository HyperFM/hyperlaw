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
    // "always" made the WebView dynamically recalculate safe-area insets
    // as things settle after launch — a native-side timing race that
    // matches the intermittent "splash lifts up a little, but not every
    // time" symptom. The app's own CSS already handles safe-area padding
    // throughout (env(safe-area-inset-*) is used extensively), so "never"
    // hands that job entirely to CSS instead of also having the native
    // layer adjust things dynamically on top of it.
    contentInset: "never",
    // Disables the WebView's own outer scroll/bounce — without this the
    // whole app can be dragged up and down like a web page (rubber-band
    // bounce revealing white past the content edges), which is exactly the
    // "acting like a web viewer" feeling. Each screen already manages its
    // own height/scrolling internally via CSS, so this only removes the
    // outer container's own scroll, not scrolling within individual views.
    scrollEnabled: false,
  },
};

export default config;
