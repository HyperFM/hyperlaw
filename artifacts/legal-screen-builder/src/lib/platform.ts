import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/** True when running inside the native iOS app wrapper (vs. the web site).
 *  Used to hide Pro-Say/Apex purchasing (removed from the iOS build per
 *  Apple Guideline 3.1.1) and to route AI billing through the iOS
 *  pay-as-you-go balance instead of web credits — see services/iosPayg.ts
 *  on the backend and X-Client-Platform below. */
export function isIosApp(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/** Opens a URL in the real system browser (Safari), not the app's own
 *  WKWebView — needed anywhere the native app hands someone off to
 *  hyperlaw.site itself (sign-up, plan changes): since the wrapper's
 *  WKWebView is already pointed at hyperlaw.site, an ordinary link/navigate
 *  would just reload the same page inside the wrapper, still native, still
 *  gated by isIosApp(). On the web this is just a normal new-tab open. */
export async function openExternal(url: string): Promise<void> {
  if (isIosApp()) {
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}
