// ─── Case photo (barrel screen) — shared between App.tsx (custom photo picker)
// and VideoWorkspaceView.tsx (pick-a-frame-from-the-video picker) ─────────────
// Downscales an image client-side (max 256px, JPEG) before handing it to the
// caller, who's responsible for persisting it (onUpdateCase + api.cases.savePhoto
// — see either call site for the actual save).
export function downscaleCasePhoto(file: File, onSaved: (dataUrl: string) => void, inputEl?: HTMLInputElement | null) {
  if (inputEl) inputEl.value = "";
  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target?.result as string;
    const img = new Image();
    img.onload = () => {
      const MAX = 256;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      let dataUrl = src;
      if (ctx) { ctx.drawImage(img, 0, 0, w, h); dataUrl = canvas.toDataURL("image/jpeg", 0.82); }
      onSaved(dataUrl);
    };
    img.onerror = () => alert("That image could not be loaded. Try a different file.");
    img.src = src;
  };
  reader.onerror = () => alert("Could not read that file.");
  reader.readAsDataURL(file);
}
