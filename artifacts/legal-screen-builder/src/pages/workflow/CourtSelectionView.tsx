import { useState } from "react";
import { HLCase, Court, CourtLevel } from "../../types";
import { US_STATES, getCourts } from "../../data/courts";
import { ChevronRight, Search, Building2, Scale } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const PANEL = "#111";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CourtSelectionView({ hlCase, onUpdate, onNext, onBack }: Props) {
  const [level, setLevel] = useState<CourtLevel | null>(
    hlCase.court?.level ?? null
  );
  const [selectedState, setSelectedState] = useState<string>(
    hlCase.court?.state ?? ""
  );
  const [stateSearch, setStateSearch] = useState(hlCase.court?.state ?? "");
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(
    hlCase.court ?? null
  );

  const filteredStates = US_STATES.filter(s =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const courts = selectedState && level ? getCourts(selectedState, level) : [];

  function selectState(s: string) {
    setSelectedState(s);
    setStateSearch(s);
    setShowStateDropdown(false);
    setSelectedCourt(null);
    // Auto-select if only one court for that state+level
    if (level) {
      const available = getCourts(s, level);
      if (available.length === 1) {
        setSelectedCourt(available[0]);
      }
    }
  }

  function selectLevel(l: CourtLevel) {
    setLevel(l);
    setSelectedCourt(null);
    if (selectedState) {
      const available = getCourts(selectedState, l);
      if (available.length === 1) setSelectedCourt(available[0]);
    }
  }

  function handleConfirm() {
    if (!selectedCourt) return;
    onUpdate({
      ...hlCase,
      court: selectedCourt,
      jurisdiction: selectedCourt.state, // backward compat
      workflowStage: "story",
    });
    onNext();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1a1815", border: "1px solid #2a2521", borderRadius: 10,
    padding: "12px 14px 12px 40px", color: PAPER, fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, color: PAPER }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "28px 20px 120px" }}>

        <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
          ← Back to Parties
        </button>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" }}>Phase 2 of 4</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Which court?</div>
          <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
            Select the court where this matter is or may be filed. If you're unsure, choose the state where the events took place.
          </div>
        </div>

        {/* Current selection display */}
        {selectedCourt && (
          <div style={{ background: "#0d1e0a", border: "1px solid #2a5a22", borderRadius: 14, padding: "16px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Scale size={20} color="#4ade80" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#4ade80", marginBottom: 2 }}>{selectedCourt.name}</div>
              <div style={{ fontSize: 12, color: "#555" }}>{selectedCourt.state} · {selectedCourt.level === "federal" ? "Federal" : "State"}{selectedCourt.shortName ? ` · ${selectedCourt.shortName}` : ""}</div>
            </div>
          </div>
        )}

        {/* Step 1: Federal or State */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Court Type</div>
          <div style={{ display: "flex", gap: 10 }}>
            {(["federal", "state"] as CourtLevel[]).map(l => (
              <button key={l} onClick={() => selectLevel(l)} style={{
                flex: 1, padding: "14px", borderRadius: 12,
                border: `1px solid ${level === l ? ORANGE : LINE}`,
                background: level === l ? `${ORANGE}18` : PANEL,
                color: level === l ? ORANGE : "#666",
                fontWeight: 800, fontSize: 15, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                <Building2 size={20} />
                {l === "federal" ? "Federal" : "State"}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: State search */}
        {level && (
          <div style={{ marginBottom: 20, position: "relative" }}>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
              {level === "federal" ? "State / Territory" : "State"}
            </div>
            <div style={{ position: "relative" }}>
              <Search size={15} color="#555" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
              <input
                style={inputStyle}
                value={stateSearch}
                onChange={e => { setStateSearch(e.target.value); setShowStateDropdown(true); setSelectedState(""); setSelectedCourt(null); }}
                onFocus={() => setShowStateDropdown(true)}
                placeholder="Search states…"
              />
            </div>
            {showStateDropdown && filteredStates.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, maxHeight: 200, overflowY: "auto", zIndex: 50, marginTop: 4 }}>
                {filteredStates.slice(0, 20).map(s => (
                  <button key={s} onClick={() => selectState(s)} style={{
                    width: "100%", background: "none", border: "none", padding: "12px 16px",
                    color: selectedState === s ? ORANGE : PAPER, textAlign: "left",
                    fontSize: 14, cursor: "pointer", borderBottom: `1px solid ${LINE}`,
                    fontWeight: selectedState === s ? 700 : 400,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a1815")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Court picker */}
        {courts.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
              Select Court
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {courts.map((court, i) => (
                <button key={i} onClick={() => setSelectedCourt(court)} style={{
                  background: selectedCourt?.name === court.name ? `${ORANGE}18` : PANEL,
                  border: `1px solid ${selectedCourt?.name === court.name ? ORANGE : LINE}`,
                  borderRadius: 12, padding: "14px 16px", textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, color: PAPER,
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selectedCourt?.name === court.name ? ORANGE : "#333"}`, background: selectedCourt?.name === court.name ? ORANGE : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {selectedCourt?.name === court.name && <div style={{ width: 6, height: 6, borderRadius: 3, background: "#000" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{court.name}</div>
                    {court.shortName && <div style={{ fontSize: 12, color: "#555" }}>{court.shortName}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No courts found */}
        {level && selectedState && courts.length === 0 && (
          <div style={{ color: "#555", fontSize: 13, padding: "16px", textAlign: "center", marginBottom: 20 }}>
            No courts found for this selection.
          </div>
        )}

        {/* Continue */}
        <button
          onClick={handleConfirm}
          disabled={!selectedCourt}
          style={{
            width: "100%", background: selectedCourt ? `linear-gradient(90deg, ${ORANGE}, #ff8c00)` : "#1a1a1a",
            border: "none", borderRadius: 14, padding: "17px",
            color: selectedCourt ? "#000" : "#444", fontSize: 16, fontWeight: 900,
            cursor: selectedCourt ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.2s",
          }}>
          Continue to Tell Your Story <ChevronRight size={18} />
        </button>

        <button onClick={onNext} style={{ width: "100%", background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginTop: 12, padding: "10px" }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
