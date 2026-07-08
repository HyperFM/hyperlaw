import React, { useRef, useEffect, useState } from "react";

const ORANGE = "#d9711f";

/** Canvas signature capture. Emits a PNG data URL (or null when cleared). */
export default function SignaturePad({ value, onChange, height = 160 }: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inkRef = useRef<boolean>(!!value);
  const [hasInk, setHasInk] = useState<boolean>(!!value);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inkRef.current) { inkRef.current = true; setHasInk(true); }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const url = inkRef.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null;
    onChange(url);
  };

  const clear = () => {
    const ctx = getCtx();
    const c = canvasRef.current;
    if (ctx && c) ctx.clearRect(0, 0, c.width, c.height);
    inkRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          width: "100%", height, background: "#0d0d0d",
          border: "1px solid #2a2a2a", borderRadius: 12,
          touchAction: "none", cursor: "crosshair", display: "block",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: hasInk ? ORANGE : "#555" }}>
          {hasInk ? "✓ Signed" : "Sign above with your finger or mouse"}
        </span>
        <button
          type="button"
          onClick={clear}
          style={{ background: "none", border: "none", color: ORANGE, fontSize: 12, cursor: "pointer" }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
