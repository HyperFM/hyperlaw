import React from "react";
import { Check } from "lucide-react";

const ORANGE = "#f45d01";

export type WorkflowStep = "parties" | "court" | "story" | "timeline";

const STEPS: Array<{ key: WorkflowStep; label: string }> = [
  { key: "parties", label: "Parties" },
  { key: "court", label: "Court" },
  { key: "story", label: "Story" },
  { key: "timeline", label: "Timeline" },
];

const STEP_INDEX: Record<WorkflowStep, number> = {
  parties: 0,
  court: 1,
  story: 2,
  timeline: 3,
};

interface Props {
  current: WorkflowStep;
}

export function WorkflowStepper({ current }: Props) {
  const currentIdx = STEP_INDEX[current];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 28 }}>
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const isLast = idx === STEPS.length - 1;
        return (
          <React.Fragment key={step.key}>
            {/* Step circle + label */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: done ? "#1a3a0a" : active ? ORANGE : "#111",
                border: `2px solid ${done ? "#3a8a22" : active ? ORANGE : "#2a2521"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.25s",
              }}>
                {done
                  ? <Check size={13} color="#4ade80" />
                  : <span style={{ fontSize: 11, fontWeight: 800, color: active ? "#000" : "#444" }}>{idx + 1}</span>
                }
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap",
                color: active ? ORANGE : done ? "#4ade80" : "#444",
                transition: "color 0.25s",
              }}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{
                flex: 1, height: 2, marginTop: 13, marginBottom: 0,
                background: idx < currentIdx ? "#3a8a2288" : "#1e1e1e",
                transition: "background 0.25s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
