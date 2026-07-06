import React, { useState, useRef, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink, ZoomIn } from "lucide-react";

const ORANGE = "#E8620A";

// ── Carousel images ─────────────────────────────────────────────────────────
interface CarouselImage {
  src: string;
  title?: string;
  description?: string;
}

const CAROUSEL_IMAGES: CarouselImage[] = [
  {
    src: "/timeline-1.png",
    title: "Detained",
    description: "Evidence footage captured during detention.",
  },
  {
    src: "/timeline-2.jpeg",
    title: "At the Courthouse",
    description: "Filing documents pro se — no attorney, no resources.",
  },
  {
    src: "/timeline-3.png",
    title: "Documentation",
    description: "Photographed evidence supporting filed claims.",
  },
  {
    src: "/timeline-4.jpeg",
    title: "Court Proceedings",
    description: "Captured moments from formal court hearings.",
  },
  {
    src: "/timeline-5.jpeg",
    title: "Evidence Record",
    description: "One of many moments preserved for the record.",
  },
  {
    src: "/timeline-6.jpeg",
    title: "The Journey",
    description: "Continued documentation through it all.",
  },
  {
    src: "/timeline-7.png",
    title: "Building HyperLaw",
    description: "Turning lived experience into technology.",
  },
  {
    src: "/timeline-8.jpeg",
    title: "Documented Injuries",
    description: "Physical evidence of harm sustained during incarceration.",
  },
  {
    src: "/timeline-9.jpeg",
    title: "Evidence of Harm",
    description: "Injuries photographed and preserved as part of the record.",
  },
  {
    src: "/timeline-10.jpeg",
    title: "Toodles — Posing",
    description: "My baby Toodles striking a pose by the pumpkins. She loved to show off.",
  },
  {
    src: "/timeline-11.jpeg",
    title: "Toodles — Pumpkin Season",
    description: "Exploring her favorite fall setup. She always had to investigate everything.",
  },
  {
    src: "/timeline-12.jpeg",
    title: "Toodles & the Dog",
    description: "Giving kisses to her dog friend. They got along better than anyone expected.",
  },
  {
    src: "/timeline-13.jpeg",
    title: "Toodles — Chaos Mode",
    description: "Scaring my little brother just by existing. She was fearless.",
  },
  {
    src: "/timeline-14.jpeg",
    title: "Toodles — Nose Ring Thief",
    description: "Caught in the act, chewing on my nose ring. She thought it was hers.",
  },
  {
    src: "/timeline-15.png",
    title: "Toodles — Chicken Nugget",
    description: "Her holding her chicken nugget. She earned it.",
  },
];

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ image, onClose }: { image: CarouselImage; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.93)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.1)", border: "none",
          borderRadius: "50%", width: 40, height: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={18} color="#fff" />
      </button>

      <img
        src={image.src}
        alt={image.title || ""}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "100%", maxHeight: "75vh",
          objectFit: "contain", borderRadius: 12,
          boxShadow: `0 0 60px ${ORANGE}33`,
        }}
      />

      {(image.title || image.description) && (
        <div style={{ textAlign: "center", marginTop: 16, maxWidth: 400 }}>
          {image.title && (
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 6 }}>{image.title}</div>
          )}
          {image.description && (
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>{image.description}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Carousel ─────────────────────────────────────────────────────────────────
function InjusticeCarousel() {
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState<CarouselImage | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const total = CAROUSEL_IMAGES.length;

  function prev() { setCurrent(c => (c - 1 + total) % total); }
  function next() { setCurrent(c => (c + 1) % total); }

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX;
    isDraggingRef.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current !== null && Math.abs(e.touches[0].clientX - startXRef.current) > 8) {
      isDraggingRef.current = true;
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    startXRef.current = null;
  }

  const img = CAROUSEL_IMAGES[current];

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingLeft: 24 }}>
        <div style={{ width: 3, height: 14, background: ORANGE, borderRadius: 2 }} />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#555", letterSpacing: 1.2 }}>INJUSTICE TIMELINE</div>
      </div>

      {/* Main image */}
      <div
        style={{ position: "relative", overflow: "hidden" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "4/3",
            background: "#0a0a0a",
            overflow: "hidden",
            position: "relative",
          }}
          onClick={() => { if (!isDraggingRef.current) setLightbox(img); }}
        >
          <img
            src={img.src}
            alt={img.title || ""}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover",
              transition: "opacity 0.3s ease",
            }}
          />
          {/* Dark overlay + tap hint */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)",
          }} />

          {/* Zoom hint */}
          <div style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(0,0,0,0.6)", borderRadius: 8,
            padding: "6px 8px", display: "flex", alignItems: "center", gap: 4,
          }}>
            <ZoomIn size={12} color="#666" />
            <span style={{ fontSize: 10, color: "#555" }}>Tap</span>
          </div>

          {/* Title + description overlay */}
          {(img.title || img.description) && (
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "16px 20px",
            }}>
              {img.title && (
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 3 }}>{img.title}</div>
              )}
              {img.description && (
                <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>{img.description}</div>
              )}
            </div>
          )}
        </div>

        {/* Prev/Next arrows */}
        <button
          onClick={prev}
          style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.65)", border: `1px solid rgba(255,255,255,0.1)`,
            borderRadius: "50%", width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={18} color="#fff" />
        </button>
        <button
          onClick={next}
          style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.65)", border: `1px solid rgba(255,255,255,0.1)`,
            borderRadius: "50%", width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ChevronRight size={18} color="#fff" />
        </button>
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
        {CAROUSEL_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            style={{
              width: i === current ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background: i === current ? ORANGE : "#2a2a2a",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "all 0.25s ease",
            }}
          />
        ))}
      </div>

      {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function AboutCreatorView({ onBack }: { onBack: () => void }) {
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        background: "#080808",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", width: "100%", height: "72dvh", minHeight: 420, maxHeight: 680, overflow: "hidden" }}>
        <img
          src="/creator-hero.jpeg"
          alt="Hyper"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
        />
        {/* Gradient fade */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(8,8,8,0.2) 0%, rgba(8,8,8,0.1) 40%, rgba(8,8,8,0.6) 70%, rgba(8,8,8,1) 100%)",
        }} />
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            position: "absolute", top: "max(16px, env(safe-area-inset-top))", left: 16,
            background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 6,
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          <ChevronLeft size={16} color="#fff" />
          Profile
        </button>

        {/* Title over hero */}
        <div style={{
          position: "absolute", bottom: 28, left: 0, right: 0,
          padding: "0 24px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 2,
            color: ORANGE, marginBottom: 8, textTransform: "uppercase",
          }}>
            About the Creator
          </div>
          <div style={{
            fontSize: 34, fontWeight: 900, lineHeight: 1.1,
            color: "#fff", letterSpacing: -0.5,
          }}>
            Hyper
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 6, fontStyle: "italic" }}>
            Builder. Advocate. Creator.
          </div>
        </div>
      </div>

      {/* ── Personal Note ─────────────────────────────────────────────── */}
      <div style={{ padding: "36px 24px 8px" }}>
        {/* Section label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <div style={{ width: 3, height: 14, background: ORANGE, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#555", letterSpacing: 1.2 }}>A PERSONAL NOTE</div>
        </div>

        <div style={{
          fontSize: 15, color: "#bbb", lineHeight: 1.85,
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          <p style={{ margin: 0 }}>
            While the events documented throughout these cases were unfolding, life did not stop.
          </p>
          <p style={{ margin: 0 }}>
            I was simultaneously navigating multiple federal lawsuits, repeated interactions with public officials, arrests, detention, homelessness, isolation, and the lasting effects of trauma that began long before any of these incidents occurred.
          </p>
          <p style={{ margin: 0, color: ORANGE, fontWeight: 700, fontSize: 16 }}>
            Despite that, I continued creating.
          </p>
          <p style={{ margin: 0 }}>
            During this same period, I completed my album <strong style={{ color: "#ddd" }}>EDGE</strong>, developed <strong style={{ color: "#ddd" }}>ShortHop</strong> — an app designed to connect people traveling in the same direction for safer, more efficient transportation — and continued building technology, documenting evidence, and advocating for myself when few others would.
          </p>
          <p style={{ margin: 0 }}>
            HyperLaw grew out of that same drive. I built it because I know firsthand what it feels like to face the legal system alone, without a lawyer, without resources, and without anyone explaining what any of it means. This app is for anyone standing where I stood.
          </p>
          <p style={{ margin: 0, color: "#777", fontSize: 14, fontStyle: "italic", borderLeft: `2px solid ${ORANGE}33`, paddingLeft: 16 }}>
            The personal cost of all of it was significant. During one of my hospitalizations, I made the painful decision to rehome my pet rat, Toodles, because I felt she deserved stability and care that I could not guarantee during that chapter of my life. It remains one of the hardest decisions I have ever made.
          </p>
          <p style={{ margin: 0 }}>
            What follows in these cases is not simply a collection of lawsuits. It is a documented timeline of events, supported by video, photographs, public records, witness statements, and court filings. The full evidence, including additional footage and documentation, can be viewed through my public profiles{" "}
            <span style={{ color: ORANGE, fontWeight: 700 }}>@HyperLaw</span> and{" "}
            <span style={{ color: ORANGE, fontWeight: 700 }}>@HyperTransparency</span>.
          </p>
          <p style={{ margin: 0 }}>
            These cases tell one story.
          </p>
          <p style={{ margin: 0, color: "#ddd", fontWeight: 700 }}>
            My decision to keep building, creating, and moving forward despite them tells another.
          </p>
          <p style={{ margin: 0, color: ORANGE, fontWeight: 800, fontSize: 17 }}>
            — Hyper
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ margin: "36px 24px", height: 1, background: "linear-gradient(to right, transparent, #2a2a2a, transparent)" }} />

      {/* ── Carousel ──────────────────────────────────────────────────── */}
      <InjusticeCarousel />

      {/* Divider */}
      <div style={{ margin: "0 24px 36px", height: 1, background: "linear-gradient(to right, transparent, #2a2a2a, transparent)" }} />

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 24px 60px" }}>
        <div style={{
          background: "#0e0e0e",
          border: `1px solid ${ORANGE}33`,
          borderRadius: 20,
          padding: "28px 24px",
          textAlign: "center",
          boxShadow: `0 0 40px ${ORANGE}0d`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: `${ORANGE}18`,
            border: `1px solid ${ORANGE}44`,
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ExternalLink size={20} color={ORANGE} />
          </div>

          <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
            Full Story, Evidence<br />& Projects
          </div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 24, lineHeight: 1.6 }}>
            Video documentation, public records, project work, and the full evidence archive.
          </div>

          <a
            href="https://beacons.ai/hyperfm"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "16px 24px",
              borderRadius: 14,
              background: `linear-gradient(135deg, ${ORANGE}, #f45d01)`,
              color: "#000",
              fontWeight: 900,
              fontSize: 15,
              textDecoration: "none",
              letterSpacing: 0.3,
              boxShadow: `0 4px 24px ${ORANGE}55`,
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.02)";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 6px 32px ${ORANGE}88`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 4px 24px ${ORANGE}55`;
            }}
          >
            View Full Story, Evidence &amp; Projects
          </a>
        </div>
      </div>
    </div>
  );
}
