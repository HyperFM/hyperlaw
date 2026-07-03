import React, { useEffect, useState } from "react";
import { X, CreditCard, Loader2, Zap } from "lucide-react";
import { aiApi, CreditProduct } from "../lib/aiApi";

const ORANGE = "#d9711f";

interface Props {
  onClose: () => void;
  onPurchaseStarted?: () => void;
}

export default function CreditShopModal({ onClose, onPurchaseStarted }: Props) {
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiApi.creditProducts()
      .then(r => {
        // Sort by price ascending
        const sorted = [...r.data].sort((a, b) => {
          const priceA = a.prices[0]?.unit_amount ?? 0;
          const priceB = b.prices[0]?.unit_amount ?? 0;
          return priceA - priceB;
        });
        setProducts(sorted);
      })
      .catch(() => setError("Could not load credit packs. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  async function handleBuy(product: CreditProduct) {
    const price = product.prices[0];
    if (!price) return;
    const credits = parseInt(product.metadata.credits ?? "1", 10);
    setBuyingId(price.id);
    setError(null);
    try {
      const { url } = await aiApi.createCreditCheckout(price.id, credits, "/");
      if (url) {
        onPurchaseStarted?.();
        window.location.href = url;
      }
    } catch (err) {
      setError((err as Error).message || "Could not start checkout. Try again.");
      setBuyingId(null);
    }
  }

  const PACK_HIGHLIGHTS: Record<string, { badge?: string; highlight?: boolean }> = {
    "5": { badge: "POPULAR", highlight: true },
    "15": { badge: "BEST VALUE" },
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 20,
        width: "100%", maxWidth: 440, padding: 28, position: "relative",
      }}>
        {/* Header */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Zap size={20} color={ORANGE} fill={ORANGE} />
          <span style={{ fontWeight: 800, fontSize: 18 }}>Document Credits</span>
        </div>
        <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
          Each credit unlocks one AI-generated formal legal document — a civil rights complaint, litigation motion, or structured timeline. Credits never expire.
        </p>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <Loader2 size={24} color="#444" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {!loading && products.length === 0 && !error && (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", padding: 24 }}>
            No credit packs available yet. Check back soon.
          </div>
        )}

        {error && (
          <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 10, padding: "12px 14px", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && products.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {products.map(product => {
              const price = product.prices[0];
              if (!price) return null;
              const credits = parseInt(product.metadata.credits ?? "1", 10);
              const info = PACK_HIGHLIGHTS[String(credits)] ?? {};
              const isHighlighted = info.highlight;

              return (
                <div
                  key={product.id}
                  style={{
                    border: `1px solid ${isHighlighted ? ORANGE : "#1e1e1e"}`,
                    borderRadius: 14,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: isHighlighted ? "rgba(217,113,31,0.04)" : "#111",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>
                        {credits} {credits === 1 ? "Credit" : "Credits"}
                      </span>
                      {info.badge && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                          background: isHighlighted ? ORANGE : "#222",
                          color: isHighlighted ? "#fff" : "#888",
                          borderRadius: 4, padding: "2px 6px",
                        }}>
                          {info.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#555", fontSize: 12 }}>
                      ${((price.unit_amount / 100) / credits).toFixed(2)}/document
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>
                      ${(price.unit_amount / 100).toFixed(2)}
                    </div>
                    <button
                      disabled={!!buyingId}
                      onClick={() => handleBuy(product)}
                      style={{
                        background: isHighlighted ? ORANGE : "#1a1a1a",
                        border: `1px solid ${isHighlighted ? ORANGE : "#2a2a2a"}`,
                        borderRadius: 10, padding: "8px 16px",
                        color: isHighlighted ? "#fff" : "#ccc",
                        fontSize: 13, fontWeight: 700, cursor: buyingId ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", gap: 6, minWidth: 80, justifyContent: "center",
                        opacity: buyingId && buyingId !== price.id ? 0.4 : 1,
                      }}
                    >
                      {buyingId === price.id
                        ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        : <><CreditCard size={13} /> Buy</>
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color: "#333", fontSize: 11, textAlign: "center", marginTop: 20 }}>
          Payments processed securely via Stripe. Credits are added to your account immediately after checkout.
        </p>
      </div>
    </div>
  );
}
