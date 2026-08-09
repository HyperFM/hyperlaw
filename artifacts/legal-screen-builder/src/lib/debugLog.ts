// Global, app-wide debug log — a plain module-level store (not React state)
// so any file can call pushDebug without needing to be under a particular
// component tree, and so the log survives navigating between pages. Only
// DebugPanel (mounted once, at the app root) reads it back out.
type Listener = (log: string[]) => void;

let log: string[] = [];
let enabled = false;
const listeners = new Set<Listener>();

/** Admin/tester gate — set once from the app root whenever bypassPaywalls changes. */
export function setDebugEnabled(v: boolean) {
  enabled = v;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

export function pushDebug(line: string) {
  if (!enabled) return;
  log = [...log, line];
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
