import { useEffect, useReducer } from "react";

// The "Chat button": once someone uses the co-parenting chat, the Tools tab can become a Chat tab that opens
// straight onto it. Double-tap the tab to flip between Chat and the full Tools list. It is a per-device
// preference (localStorage), and the child's photo never leaves the device.

const K_ENABLED = "hl_chat_tab_enabled";   // "1" | "0"
const K_MODE = "hl_chat_tab_mode";         // "chat" | "tools"
const K_OPTOUT = "hl_chat_tab_optout";     // "1" once the person turned it off themselves
const K_LAST = "hl_family_last_thread";
const photoKey = (threadId: string) => `hl_family_photo_${threadId}`;
const EVT = "hl-chat-tab-changed";

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const emit = () => window.dispatchEvent(new Event(EVT));

export function chatTabState(): { enabled: boolean; mode: "chat" | "tools" } {
  const enabled = read(K_ENABLED) === "1";
  return { enabled, mode: enabled && read(K_MODE) !== "tools" ? "chat" : "tools" };
}

export function setChatTabEnabled(on: boolean) {
  write(K_ENABLED, on ? "1" : "0");
  write(K_OPTOUT, on ? null : "1");
  if (on) write(K_MODE, "chat");
  emit();
}

export function setChatTabMode(mode: "chat" | "tools") { write(K_MODE, mode); emit(); }

/** Called when someone starts or joins their first co-parenting chat. Turns the Chat button on unless they'd turned it off. */
export function autoEnableChatTab(): boolean {
  if (read(K_ENABLED) !== null || read(K_OPTOUT) === "1") return false;
  setChatTabEnabled(true);
  return true;
}

export function getThreadPhoto(threadId: string): string | null { return read(photoKey(threadId)); }
export function setThreadPhoto(threadId: string, dataUrl: string | null) { write(photoKey(threadId), dataUrl); write(K_LAST, threadId); emit(); }
export function rememberThread(threadId: string) { write(K_LAST, threadId); emit(); }
export function lastThreadPhoto(): string | null { const id = read(K_LAST); return id ? read(photoKey(id)) : null; }

/** Downscale to a small centered square JPEG so it is cheap to keep on the device. */
export function resizeSquare(file: File, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo")); };
    img.src = url;
  });
}

export function useChatTab() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    window.addEventListener(EVT, bump);
    window.addEventListener("storage", bump);
    return () => { window.removeEventListener(EVT, bump); window.removeEventListener("storage", bump); };
  }, []);
  const s = chatTabState();
  return { ...s, photo: lastThreadPhoto(), setEnabled: setChatTabEnabled, setMode: setChatTabMode };
}
