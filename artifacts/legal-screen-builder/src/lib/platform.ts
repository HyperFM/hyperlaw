import { Capacitor } from "@capacitor/core";

/** True when running inside the native iOS app wrapper (vs. the web site).
 *  Used to hide Pro-Say/Apex purchasing (removed from the iOS build per
 *  Apple Guideline 3.1.1) and to route AI billing through the iOS
 *  pay-as-you-go balance instead of web credits — see services/iosPayg.ts
 *  on the backend and X-Client-Platform below. */
export function isIosApp(): boolean {
  return Capacitor.getPlatform() === "ios";
}
