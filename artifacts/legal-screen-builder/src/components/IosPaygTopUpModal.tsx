import React, { useEffect, useState } from "react";
import { X, Zap, Loader2 } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import { iapPlugin, IOS_PAYG_TOPUP_PRODUCT_ID, IOS_PAYG_FIRST_PRODUCT_ID } from "../lib/iapPlugin";

const ORANGE = "#d9711f";

interface Props {
  onClose: () => void;
  /** Called with the fresh balance after a successful top-up, so the parent
   *  can refresh whatever's displaying it. */
  onPurchased?: (balanceMicroUsd: number) => void;
}

/** iOS-only equivalent of CreditShopModal — drives a native StoreKit purchase
 *  instead of a Stripe Checkout redirect. Kept as a separate component: the
 *  two flows share almost nothing (one redirects out to Stripe, this one
 *  drives an in-app native sheet + server-side receipt verification). */
export default function IosPaygTopUpModal({ onClose, onPurchased }: Props) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceMicroUsd, setBalanceMicroUsd] = useState<number | null>(null);
  // The $0.99 starter is offered once, on an account's first purchase (server decides).
  const [firstAvailable, setFirstAvailable] = useState(false);

  useEffect(() => {
    aiApi.iosPaygBalance().then(r => { setBalanceMicroUsd(r.balanceMicroUsd); setFirstAvailable(!!r.firstTopUpAvailable); }).catch(() => {});
  }, []);

  async function handleBuy(productId: string = IOS_PAYG_TOPUP_PRODUCT_ID) {
    setBuying(true);
    setError(null);
    try {
      const purchase = await iapPlugin.purchase({ productId });
      const verified = await aiApi.verifyApplePurchase(purchase.jwsRepresentation);
      // 200 (ok) or 409-turned-{ok:false, code:"already_processed"} both mean
      // StoreKit's side is done — finish the transaction either way so it
      // stops being re-presented as unfinished.
      await iapPlugin.finishTransaction({ transactionId: purchase.transactionId });
      if (verified.ok && typeof verified.balanceMicroUsd === "number") {
        setBalanceMicroUsd(verified.balanceMicroUsd);
        onPurchased?.(verified.balanceMicroUsd);
        onClose();
      } else if (verified.code === "already_processed") {
        onClose();
      } else {
        setError("Purchase completed but couldn't be confirmed — try Restore Purchases, or contact support.");
      }
    } catch (err) {
      const message = (err as Error).message || "";
      if (message !== "user_cancelled") {
        setError(message || "Could not complete purchase. Try again.");
      }
    } finally {
      setBuying(false);
    }
  }

  async function handleRestore() {
    setBuying(true);
    setError(null);
    try {
      await iapPlugin.restorePurchases();
      const fresh = await aiApi.iosPaygBalance();
      setBalanceMicroUsd(fresh.balanceMicroUsd);
      onPurchased?.(fresh.balanceMicroUsd);
    } catch (err) {
      setError((err as Error).message || "Could not restore purchases.");
    } finally {
      setBuying(false);
    }
  }

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
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Zap size={20} color={ORANGE} fill={ORANGE} />
          <span style={{ fontWeight: 800, fontSize: 18 }}>Quick Top-Up</span>
        </div>
        {balanceMicroUsd !== null && (
          <p style={{ color: ORANGE, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            Current balance: ${(balanceMicroUsd / 1_000_000).toFixed(2)}
          </p>
        )}
        <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>
          Adds $5.00 to your balance, spent only as you actually draft — the easy way to keep going right here
          in the app.
        </p>
        <p style={{ color: "#666", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
          Want a full plan upgrade instead? That's managed on{" "}
          <span style={{ color: ORANGE, fontWeight: 700 }}>hyperlaw.site</span>, not here.
        </p>
        <p style={{ color: ORANGE, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 24 }}>
          In-App Purchase
        </p>

        {error && (
          <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 10, padding: "12px 14px", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {firstAvailable && (
          <button
            disabled={buying}
            onClick={() => handleBuy(IOS_PAYG_FIRST_PRODUCT_ID)}
            style={{
              width: "100%", background: "#1a1208", border: `1px solid ${ORANGE}`,
              borderRadius: 12, padding: "14px 16px", color: ORANGE,
              fontSize: 15, fontWeight: 700, cursor: buying ? "not-allowed" : "pointer",
              opacity: buying ? 0.6 : 1, marginBottom: 6,
            }}
          >
            Try it for $0.99
          </button>
        )}
        {firstAvailable && (
          <p style={{ color: "#666", fontSize: 12, textAlign: "center", marginBottom: 14 }}>
            A one-time starter so you can see how it works. After this, top-ups are $5.
          </p>
        )}
        <button
          disabled={buying}
          onClick={() => handleBuy()}
          style={{
            width: "100%", background: ORANGE, border: `1px solid ${ORANGE}`,
            borderRadius: 12, padding: "14px 16px", color: "#fff",
            fontSize: 15, fontWeight: 700, cursor: buying ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: buying ? 0.6 : 1, marginBottom: 10,
          }}
        >
          {buying ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Buy $5 Credit"}
        </button>

        <button
          disabled={buying}
          onClick={handleRestore}
          style={{
            width: "100%", background: "none", border: "none",
            color: "#666", fontSize: 12, cursor: buying ? "not-allowed" : "pointer",
            padding: "6px 0",
          }}
        >
          Restore Purchases
        </button>

        <p style={{ color: "#333", fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Purchases processed by Apple. Balance is added to your account immediately after purchase.
        </p>
      </div>
    </div>
  );
}
