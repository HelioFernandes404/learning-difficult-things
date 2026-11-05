/**
 * Pure audit (no DB/fs): turn input derivation and anomaly flags.
 * Used by src/app/api/chat/route.ts, tools.ts e scripts/eval.ts.
 */
import type { UIMessage } from "ai";
import { CONFIDENCE_NUMBER_PT, EXERCISE_PREFIX_PT_NORMALIZED, STOP_WORDS_PT } from "@/lib/legacy-pt";

export const FLAGS = [
  "ended_text_only",
  "no_text_in_teaching",
  "invisible_chars",
  "garbage_token",
  "regrade",
  "stale_check_id",
  "multiple_ask_check",
  "slow",
  "heavy",
  "confidence_mentioned_number",
  "repeat_check",
] as const;
export type Flag = (typeof FLAGS)[number];

/** high = probable bug; warn = suspicious. */
export const FLAG_SEVERITY: Record<Flag, "high" | "warn"> = {
  ended_text_only: "warn",
  no_text_in_teaching: "high",
  invisible_chars: "high",
  garbage_token: "high",
  regrade: "high",
  stale_check_id: "high",
  multiple_ask_check: "high",
  slow: "warn",
  heavy: "warn",
  confidence_mentioned_number: "high",
  repeat_check: "warn",
};

/** Turn context passed to tools to report flags/audit. */
export type TurnCtx = { turnId: string; flag: (f: Flag) => void };

export type TurnInput = {
  kind: "text" | "ask_check" | "offer_choices";
  text?: string;
  answer?: string;
  confidence?: number;
  checkId?: string;
  choice?: string;
};

export const SLOW_MS = 20_000;
export const HEAVY_TOKENS = 30_000;

export const ACRONYMS = new Set(
  ("SRE SLO SLI SLA API HTTP HTTPS CPU GPU RAM DNS YAML JSON CRUD REST NODE PODS TCP UDP SQL HTML CSS URL URI JWT TLS SSL SSH AWS GCP IDE UTF ASCII LIFO FIFO CLI MTTR MTBF MTTD NULL TRUE FALSE").split(" "),
);

const INVISIBLE_RE = /[­​-‍⁠﻿]/;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;

export const hasInvisible = (text: string) => INVISIBLE_RE.test(text);

/** ALL-CAPS word (>=4 letters) outside code blocks and outside the acronym list. */
export function garbageTokens(text: string): string[] {
  const words = text.replace(CODE_BLOCK_RE, " ").match(/\b[A-Z]{4,}\b/g) ?? [];
  return words.filter((w) => !ACRONYMS.has(w));
}
export const hasGarbageToken = (text: string) => garbageTokens(text).length > 0;

/** Average words per sentence (outside code blocks). */
export function avgSentenceWords(text: string) {
  const sentences = text
    .replace(CODE_BLOCK_RE, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = sentences.map((s) => s.split(/\s+/).length);
  return words.length ? words.reduce((a, b) => a + b, 0) / words.length : 0;
}

const STOP_RE = new RegExp(`\\b(end|stop|enough|bye|quit|that's all|${STOP_WORDS_PT})\\b`, "i");
const CONFIDENCE_RE = new RegExp(`(?:confidence|${CONFIDENCE_NUMBER_PT})\\s*\\d`, "i");
const EXERCISE_RE = new RegExp(`^\\s*(?:exercise|${EXERCISE_PREFIX_PT_NORMALIZED}):?`);

export const wantsEnd = (input: TurnInput) => STOP_RE.test(input.text ?? input.answer ?? "");

export function normalizeQuestion(q: string) {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(EXERCISE_RE, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function similarQuestions(a: string, b: string) {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = new Set(na.split(" ").filter((w) => w.length > 2));
  const sb = new Set(nb.split(" ").filter((w) => w.length > 2));
  const inter = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 && inter / union >= 0.75;
}

type Part = { type: string; input?: unknown; output?: unknown; text?: string };

/** Student input: card output (ask_check/offer_choices) in the last assistant message, or the user text. */
export function deriveInput(messages: UIMessage[]): TurnInput {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    for (const p of [...(last.parts as Part[])].reverse()) {
      if (p.type === "tool-ask_check" && p.output) {
        const o = p.output as { answer?: string; confidence?: number; checkId?: string };
        return { kind: "ask_check", answer: o.answer, confidence: o.confidence, checkId: o.checkId };
      }
      if (p.type === "tool-offer_choices" && p.output) {
        const o = p.output as { choiceId?: string; label?: string; other?: string };
        return { kind: "offer_choices", choice: o.choiceId, text: o.other ?? o.label };
      }
    }
  }
  const m = [...messages].reverse().find((x) => x.role === "user");
  return { kind: "text", text: (m?.parts as Part[] | undefined)?.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "" };
}

/** ask_check questions already asked in the conversation history. */
export function priorQuestions(messages: UIMessage[]): string[] {
  return messages.flatMap((m) =>
    (m.parts as Part[])
      .filter((p) => p.type === "tool-ask_check")
      .map((p) => String((p.input as { question?: string } | undefined)?.question ?? ""))
      .filter(Boolean),
  );
}

export type StepSummary = { text: string; toolCalls: { name: string; input?: unknown }[] };

export function endedWith(steps: StepSummary[]): string {
  const names = steps.flatMap((s) => s.toolCalls.map((c) => c.name));
  if (names.includes("ask_check")) return "ask_check";
  if (names.includes("offer_choices")) return "offer_choices";
  const lastStep = steps[steps.length - 1];
  if (!lastStep) return "empty";
  if (lastStep.toolCalls.length) return "tools";
  return lastStep.text.trim() ? "text" : "empty";
}

export function computeFlags(a: {
  input: TurnInput;
  steps: StepSummary[];
  latencyMs: number;
  totalTokens: number;
  prior?: string[];
  /** flags detected by tools (regrade, stale_check_id) */
  extra?: Iterable<Flag>;
}): Flag[] {
  const out = new Set<Flag>(a.extra ?? []);
  const text = a.steps.map((s) => s.text).join("\n");
  const calls = a.steps.flatMap((s) => s.toolCalls);
  const asks = calls.filter((c) => c.name === "ask_check");
  const end = endedWith(a.steps);

  if (end === "text" && !wantsEnd(a.input)) out.add("ended_text_only");
  if (calls.some((c) => c.name.startsWith("show_")) && !text.trim()) out.add("no_text_in_teaching");
  if (hasInvisible(text)) out.add("invisible_chars");
  if (hasGarbageToken(text)) out.add("garbage_token");
  if (asks.length > 1) out.add("multiple_ask_check");
  if (a.latencyMs > SLOW_MS) out.add("slow");
  if (a.totalTokens > HEAVY_TOKENS) out.add("heavy");
  const questions = asks.map((c) => String((c.input as { question?: string } | undefined)?.question ?? ""));
  if (CONFIDENCE_RE.test(text) || questions.some((q) => CONFIDENCE_RE.test(q))) out.add("confidence_mentioned_number");
  if (questions.some((q) => (a.prior ?? []).some((p) => similarQuestions(q, p)))) out.add("repeat_check");
  return FLAGS.filter((f) => out.has(f));
}
