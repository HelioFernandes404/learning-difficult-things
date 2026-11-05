import type { Mastery } from "@/lib/schema";

export type EvidenceIn = {
  kind: "taught" | "check" | "note" | "misconception";
  verdict?: string | null;
  confidence?: number | null;
  ts: number;
};

export type MasteryResult = { mastery: Mastery; score: number; lastConfidence: number | null; correct: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Deterministic rules (replay of the evidence in time order):
 * correct + conf>=4: +0.35 | correct low conf: +0.2 | partial: +0.05 | wrong: -0.2
 * wrong + conf>=4: misconception (cleared by the next correct) | only taught: learning
 * mastered: score >= 0.75 with >= 2 correct checks.
 */
export function computeMastery(evidence: EvidenceIn[]): MasteryResult {
  let score = 0;
  let correct = 0;
  let misconception = false;
  let seen = false;
  let lastConfidence: number | null = null;
  for (const e of [...evidence].sort((a, b) => a.ts - b.ts)) {
    if (e.kind === "taught") {
      seen = true;
    } else if (e.kind === "misconception") {
      seen = true;
      misconception = true;
    } else if (e.kind === "check" && e.verdict) {
      seen = true;
      const hi = (e.confidence ?? 0) >= 4;
      if (e.confidence != null) lastConfidence = e.confidence;
      if (e.verdict === "correct") {
        score = clamp(score + (hi ? 0.35 : 0.2));
        correct++;
        misconception = false;
      } else if (e.verdict === "partial") {
        score = clamp(score + 0.05);
      } else if (e.verdict === "wrong") {
        score = clamp(score - 0.2);
        if (hi) misconception = true;
      }
    }
  }
  let mastery: Mastery = "unseen";
  if (misconception) mastery = "misconception";
  else if (score >= 0.75 && correct >= 2) mastery = "mastered";
  else if (seen) mastery = "learning";
  return { mastery, score: Math.round(score * 100) / 100, lastConfidence, correct };
}
