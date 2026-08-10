// Global, app-wide debug log — a plain module-level store (not React state)
// so any file can call pushDebug without needing to be under a particular
// component tree, and so the log survives navigating between pages. Only
// DebugPanel (mounted once, at the app root) reads it back out.
type Listener = (log: string[]) => void;

// Every entry ever recorded, capped so an always-on log can't grow
// unbounded over a long session.
const MAX_LOG_ENTRIES = 500;

let log: string[] = [];
let enabled = false;
const listeners = new Set<Listener>();

/** Admin/tester gate — set once from the app root whenever bypassPaywalls
 *  changes. Only gates whether DebugPanel is allowed to SHOW anything
 *  (its own `enabled` prop check) — recording itself (below) no longer
 *  depends on this, see pushDebug's own comment for why. */
export function setDebugEnabled(v: boolean) {
  enabled = v;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

// Used to gate recording on `enabled` — but enabled only flips true from a
// useEffect in DebugPanel, which runs after the admin/tester check
// resolves. Anything logged between app launch and that check finishing —
// exactly the FilePicker/video-load messages fired the instant someone
// reopens the app and immediately picks a video — was silently dropped,
// and if nothing logged after that, the panel never appeared at all.
// Always records now; enabled only controls whether it's ever displayed.
export function pushDebug(line: string) {
  log = [...log, line].slice(-MAX_LOG_ENTRIES);
  listeners.forEach(fn => fn(log));
}

/** Manual-only — nothing in this module ever calls this itself. */
export function clearDebugLog() {
  log = [];
  listeners.forEach(fn => fn(log));
}

export function subscribeDebugLog(fn: Listener): () => void {
  listeners.add(fn);
  fn(log);
  return () => { listeners.delete(fn); };
}
