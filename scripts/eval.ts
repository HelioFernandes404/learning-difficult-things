/**
 * Tutor eval: pnpm eval [--n 2] [--efforts low,medium] [--only a,b] [--locale en|pt-BR|both]
 * Uses the same model, prompt, tools and guard as the chat. Tools with DB effects become no-ops.
 */
import fs from "node:fs";
import path from "node:path";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { getModel, reasoningOptions } from "@/lib/llm";
import { getLlmConfig } from "@/lib/settings";
import { LOCALES, isLocale, messages, type Locale } from "@/i18n";
import { composeFirstMessage, type LessonRequest } from "@/lib/lesson-request";
import { buildSystemPrompt, exercisePrefix, type PromptContext } from "@/lib/tutor/prompt";
import { makeTools } from "@/lib/tutor/tools";
import { formatGuard } from "@/lib/tutor/guard";
import { avgSentenceWords, computeFlags, endedWith, hasGarbageToken, hasInvisible, type TurnInput } from "@/lib/tutor/audit";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = Number(arg("n", "2"));
const EFFORTS = arg("efforts", "low,medium").split(",");
const ONLY = arg("only", "").split(",").filter(Boolean);
const LOCALE_ARG = arg("locale", "both");
const EVAL_LOCALES: readonly Locale[] = isLocale(LOCALE_ARG) ? [LOCALE_ARG] : LOCALES;

const base: Omit<PromptContext, "topic" | "request" | "context" | "level"> = {
  goal: null,
  lessonMap: [],
  conceptTitles: [],
  recentChecks: [],
};

type Scenario = {
  id: string;
  ctx: PromptContext;
  messages: ModelMessage[];
  expectAsk: boolean;
  expectVisual: boolean;
  allowEmptyText?: boolean;
  /** requires offer_choices */
  expectChoices?: boolean;
  /** requires an ask_check whose question starts with the exercise prefix and no offer_choices */
  expectExercise?: boolean;
};

const user = (content: string): ModelMessage => ({ role: "user", content });

/** Scenarios for one locale: student-facing text comes from the `tutor.evalScenarios` dictionary. */
function buildScenarios(locale: Locale): Scenario[] {
  const sc = messages(locale).tutor.evalScenarios;
  const first = (r: LessonRequest) => user(composeFirstMessage(r, locale));
  const sreMap = (statuses: ("todo" | "current" | "done")[]) =>
    [sc.stepErrorBudget, sc.stepBurnWhat, sc.stepBurnCalc, sc.stepBurnAlerts].map((title, i) => ({ id: `s${i + 1}`, title, status: statuses[i] }));
  return [
    {
      id: "a",
      ctx: { ...base, topic: sc.burnRate, request: sc.burnRate, context: null, level: "heard_of" },
      messages: [first({ request: sc.burnRate, level: "heard_of" })],
      expectAsk: true,
      expectVisual: false,
    },
    {
      id: "b",
      ctx: { ...base, topic: sc.nodeCluster, request: sc.nodeCluster, context: sc.devops, level: "heard_of" },
      messages: [first({ request: sc.nodeClusterRequest, context: sc.devops, level: "heard_of" })],
      expectAsk: true,
      expectVisual: true,
    },
    {
      id: "c",
      ctx: { ...base, topic: sc.vagueTopic, request: sc.vagueTopic, context: null, level: null },
      messages: [first({ request: sc.vagueTopic })],
      expectAsk: false,
      allowEmptyText: true, // the offer_choices card shows the question
      expectChoices: true,
      expectVisual: false,
    },
    {
      id: "d",
      ctx: {
        ...base,
        topic: sc.burnRate,
        request: sc.burnRate,
        context: sc.sre,
        level: "heard_of",
        lessonMap: sreMap(["done", "current", "todo", "todo"]),
      },
      messages: [
        first({ request: sc.burnRate, context: sc.sre, level: "heard_of" }),
        {
          role: "assistant",
          content: [
            { type: "text", text: sc.dAssistantText },
            { type: "tool-call", toolCallId: "c1", toolName: "ask_check", input: { question: sc.dQuestion } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "ask_check",
              output: { type: "json", value: { answer: sc.dAnswer, confidence: 3, checkId: "x" } },
            },
          ],
        },
        user(sc.dFollowUp),
      ],
      expectAsk: true,
      expectVisual: true,
    },
    {
      id: "e",
      ctx: {
        ...base,
        topic: sc.burnRate,
        request: sc.burnRate,
        context: sc.sre,
        level: "heard_of",
        exercisesDone: 0,
        conceptTitles: [sc.stepErrorBudget, "Burn rate"],
        lessonMap: sreMap(["done", "done", "done", "done"]),
        recentChecks: [{ question: sc.eQuestion, confidence: 4, verdict: "correct" }],
      },
      messages: [
        first({ request: sc.burnRate, context: sc.sre, level: "heard_of" }),
        {
          role: "assistant",
          content: [
            { type: "text", text: sc.eAssistantText },
            { type: "tool-call", toolCallId: "c2", toolName: "ask_check", input: { question: sc.eQuestion } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c2",
              toolName: "ask_check",
              output: { type: "json", value: { answer: sc.eAnswer, confidence: 4, checkId: "y" } },
            },
          ],
        },
      ],
      expectAsk: true,
      expectVisual: false,
      expectExercise: true,
    },
  ];
}

function checkText(text: string) {
  return { invisible: hasInvisible(text), garbage: hasGarbageToken(text), avgWords: avgSentenceWords(text) };
}

/** Real tools, but without DB: ask_check stays without execute (client-side). */
function evalTools() {
  const t = makeTools("eval") as unknown as Record<string, ReturnType<typeof tool>>;
  const noop = () => ({ ok: true });
  for (const k of ["grade_check", "save_concept", "set_lesson_map"]) {
    t[k] = { ...t[k], execute: noop } as never;
  }
  return t as unknown as ReturnType<typeof makeTools>;
}

async function runOne(s: Scenario, effort: string, locale: Locale) {
  const started = Date.now();
  const r = await generateText({
    model: getModel(),
    system: buildSystemPrompt(s.ctx, locale),
    messages: s.messages,
    tools: evalTools(),
    providerOptions: reasoningOptions(getLlmConfig(), effort),
    stopWhen: stepCountIs(8),
    prepareStep: ({ steps }) => formatGuard({ steps }),
  });
  const latencyMs = Date.now() - started;
  const text = r.steps.map((st) => st.text).join("\n").trim();
  const allCalls = r.steps.flatMap((st) => st.toolCalls);
  const calls = allCalls.map((c) => c.toolName);
  const askQuestions = allCalls.filter((c) => c.toolName === "ask_check").map((c) => String((c.input as { question?: string }).question ?? ""));
  const t = checkText(text);
  const lastMsg = s.messages[s.messages.length - 1];
  const input: TurnInput = { kind: "text", text: lastMsg.role === "user" && typeof lastMsg.content === "string" ? lastMsg.content : "" };
  const stepSummaries = r.steps.map((st) => ({ text: st.text, toolCalls: st.toolCalls.map((c) => ({ name: c.toolName, input: c.input })) }));
  const flags = computeFlags({ input, steps: stepSummaries, latencyMs, totalTokens: r.totalUsage.totalTokens ?? 0 });
  const hasVisual = calls.some((c) => c.startsWith("show_")) || /```(mermaid|text)/.test(text);
  const checks = {
    text: s.allowEmptyText || text.length > 0,
    ask: s.expectAsk ? calls.includes("ask_check") : true,
    visual: s.expectVisual ? hasVisual : true,
    choices: s.expectChoices ? calls.includes("offer_choices") : true,
    exercise: s.expectExercise ? askQuestions.some((q) => q.trim().startsWith(exercisePrefix(locale))) && !calls.includes("offer_choices") : true,
    noInvisible: !t.invisible,
    noGarbage: !t.garbage,
    sentences: t.avgWords <= 22,
  };
  return {
    scenario: s.id,
    locale,
    effort,
    pass: Object.values(checks).every(Boolean),
    checks,
    avgWords: Number(t.avgWords.toFixed(1)),
    flags,
    endedWith: endedWith(stepSummaries),
    calls,
    text,
    latencyMs,
    tokens: r.totalUsage.totalTokens ?? 0,
  };
}

async function main() {
  const jobs = EVAL_LOCALES.flatMap((loc) =>
    EFFORTS.flatMap((e) =>
      buildScenarios(loc)
        .filter((s) => !ONLY.length || ONLY.includes(s.id))
        .flatMap((s) => Array.from({ length: N }, () => ({ s, e, loc }))),
    ),
  );
  console.log(`model=${getLlmConfig().model} runs=${jobs.length}`);
  const results = await Promise.all(
    jobs.map(({ s, e, loc }) =>
      runOne(s, e, loc).catch((err) => ({ scenario: s.id, locale: loc, effort: e, pass: false, error: String(err), checks: {}, latencyMs: 0, tokens: 0, calls: [], text: "", avgWords: 0 })),
    ),
  );

  const names = ["text", "ask", "visual", "choices", "exercise", "noInvisible", "noGarbage", "sentences"] as const;
  console.log("\nlocale effort scn pass " + names.map((n) => n.padEnd(11)).join("") + "words tokens latency  flags / tools");
  for (const r of results.sort((a, b) => (a.locale + a.effort + a.scenario).localeCompare(b.locale + b.effort + b.scenario))) {
    const c = r.checks as Record<string, boolean>;
    console.log(
      `${r.locale.padEnd(6)} ${r.effort.padEnd(6)} ${r.scenario.padEnd(3)} ${(r.pass ? "OK" : "FAIL").padEnd(4)} ` +
        names.map((n) => (c[n] === undefined ? "?" : c[n] ? "y" : "N").padEnd(11)).join("") +
        `${String(r.avgWords).padEnd(5)} ${String(r.tokens).padEnd(6)} ${String(r.latencyMs).padEnd(7)} ${((r as { flags?: string[] }).flags ?? []).join("+") || "-"} | ${r.calls.join(",")}`,
    );
  }
  console.log("\nsummary");
  for (const loc of EVAL_LOCALES) {
    for (const e of EFFORTS) {
      const rs = results.filter((r) => r.effort === e && r.locale === loc);
      if (!rs.length) continue;
      const avg = (f: (r: (typeof rs)[number]) => number) => Math.round(rs.reduce((a, r) => a + f(r), 0) / rs.length);
      console.log(`${loc} ${e}: pass ${rs.filter((r) => r.pass).length}/${rs.length}  tokens ${avg((r) => r.tokens)}  latency ${avg((r) => r.latencyMs)}ms`);
    }
  }
  fs.mkdirSync("logs", { recursive: true });
  const file = path.join("logs", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`\nresults: ${file}`);
}

main();
