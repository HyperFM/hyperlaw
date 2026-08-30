import React, { useEffect, useRef, useState } from "react";

const ORANGE = "#d9711f";
const VIEWPORT = 280; // on-screen crop frame size (square), in px
const OUTPUT = 256; // final saved image size, in px — matches downscaleCasePhoto's max

// A square crop step shown after picking a photo for a case icon — drag to
// reposition, use the slider to zoom in, then confirm. Outputs a single
// square JPEG data URL at the same size the rest of the app already expects
// (see downscaleCasePhoto in lib/casePhoto.ts), so callers can hand that
// straight to onUpdateCase/api.cases.savePhoto with no extra resize step.
export default function PhotoCropModal({ file, onCancel, onCropped }: {
  file: File;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; startOffX: number; startOffY: number }>(
    { dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 }
  );

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const minScale = natural.w && natural.h ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const displayScale = minScale * zoom;
  const displayW = natural.w * displayScale;
  const displayH = natural.h * displayScale;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, (displayW - VIEWPORT) / 2);
    const maxY = Math.max(0, (displayH - VIEWPORT) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.startOffX + dx, dragRef.current.startOffY + dy));
  }
  function onPointerUp() { dragRef.current.dragging = false; }

  function handleZoomChange(next: number) {
    setZoom(next);
    const nextScale = minScale * next;
    const maxX = Math.max(0, (natural.w * nextScale - VIEWPORT) / 2);
    const maxY = Math.max(0, (natural.h * nextScale - VIEWPORT) / 2);
    setOffset(o => ({ x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) }));
  }

  function handleUsePhoto() {
    if (!imgUrl || !natural.w) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT; canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const srcSize = VIEWPORT / displayScale;
        const srcX = natural.w / 2 - offset.x / displayScale - srcSize / 2;
        const srcY = natural.h / 2 - offset.y / displayScale - srcSize / 2;
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);
      }
      onCropped(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = imgUrl;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", marginBottom: 6 }}>Adjust Photo</div>
      <div style={{ color: "#777", fontSize: 12.5, marginBottom: 20, textAlign: "center" }}>Drag to reposition, use the slider to zoom</div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: VIEWPORT, height: VIEWPORT, borderRadius: 20, overflow: "hidden",
          background: "#111", border: `1px solid ${ORANGE}55`, position: "relative",
          cursor: "grab", touchAction: "none", flexShrink: 0,
        }}>
        {imgUrl && (
          <img
            src={imgUrl}
            alt=""
            draggable={false}
            onLoad={handleImgLoad}
            style={{
              position: "absolute", left: "50%", top: "50%", width: displayW || undefined, height: displayH || undefined,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              maxWidth: "none", pointerEvents: "none", userSelect: "none",
            }}
          />
        )}
      </div>

      <input
        type="range" min={1} max={3} step={0.01} value={zoom}
        onChange={e => handleZoomChange(Number(e.target.value))}
        style={{ width: VIEWPORT, marginTop: 20, accentColor: ORANGE }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 24, width: VIEWPORT }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#aaa", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={handleUsePhoto} disabled={!natural.w}
          style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: ORANGE, color: "#000", fontWeight: 800, fontSize: 14, cursor: natural.w ? "pointer" : "default", opacity: natural.w ? 1 : 0.5 }}>
          Use Photo
        </button>
      </div>
    </div>
  );
}
