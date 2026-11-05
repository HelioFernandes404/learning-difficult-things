import { convertToModelMessages, createIdGenerator, stepCountIs, streamText, type UIMessage } from "ai";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { localeFromRequest, messages as dictMessages } from "@/i18n";
import { sessionLocale } from "@/lib/session-locale";
import { db } from "@/lib/db";
import { messages as messagesTable, sessions } from "@/lib/schema";
import { getModel, MissingKeyError, reasoningOptions } from "@/lib/llm";
import { getLlmConfig } from "@/lib/settings";
import { logEvent } from "@/lib/log";
import { buildSystemPrompt } from "@/lib/tutor/prompt";
import { loadContext } from "@/lib/tutor/context";
import { makeTools } from "@/lib/tutor/tools";
import { formatGuard } from "@/lib/tutor/guard";
import { stripInvisible } from "@/lib/sanitize";
import { computeFlags, deriveInput, endedWith, priorQuestions, type Flag, type StepSummary } from "@/lib/tutor/audit";
import { recordAudit } from "@/lib/tutor/audit-db";
import { extractTurn } from "@/lib/graph/extract";

export const maxDuration = 120;

export async function POST(req: Request) {
  const started = Date.now();
  const turnId = `t_${randomUUID().slice(0, 8)}`;
  let sessionId = "";
  try {
    const body = (await req.json()) as { messages: UIMessage[]; sessionId: string };
    sessionId = body.sessionId;
    const { messages } = body;
    const reqLocale = localeFromRequest(req);
    if (!sessionId || !Array.isArray(messages)) {
      return Response.json({ error: dictMessages(reqLocale).tutor.errors.missingFields }, { status: 400 });
    }
    const sessionRow = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!sessionRow) {
      return Response.json({ error: dictMessages(reqLocale).tutor.errors.sessionNotFound }, { status: 404 });
    }
    const locale = sessionLocale(sessionRow);

    const cfg = getLlmConfig();
    const model = getModel(undefined, cfg); // throws MissingKeyError if the key is missing
    const system = buildSystemPrompt(loadContext(sessionId), locale);
    const systemHash = createHash("sha256").update(system).digest("hex").slice(0, 12);
    const input = deriveInput(messages);
    const prior = priorQuestions(messages);
    const toolFlags = new Set<Flag>();
    const turn = { turnId, flag: (f: Flag) => void toolFlags.add(f) };
    const stepsLog: StepSummary[] = [];
    let stepIndex = 0;
    let lastAt = started;
    let pendingGuard: { toolChoice: string } | null = null;

    logEvent("turn_start", {
      sessionId,
      turnId,
      model: cfg.model,
      provider: cfg.provider,
      effort: cfg.reasoningEffort,
      systemHash,
      systemLength: system.length,
      messageCount: messages.length,
      input,
    });

    const result = streamText({
      model,
      system,
      messages: convertToModelMessages(messages),
      tools: makeTools(sessionId, turn),
      providerOptions: reasoningOptions(cfg),
      stopWhen: stepCountIs(8),
      prepareStep: ({ steps }) => {
        const g = formatGuard({ steps });
        pendingGuard = g ?? null;
        return g;
      },
      onStepFinish: (s) => {
        const now = Date.now();
        const toolCalls = s.toolCalls.map((c) => ({ name: c.toolName, input: c.input }));
        const toolResults = s.toolResults.map((r) => ({ name: r.toolName, output: r.output }));
        stepsLog.push({ text: s.text, toolCalls });
        logEvent("step", {
          sessionId,
          turnId,
          stepIndex: stepIndex++,
          text: s.text,
          reasoningText: s.reasoningText ?? null,
          toolCalls,
          toolResults,
          finishReason: s.finishReason,
          usage: s.usage,
          stepLatencyMs: now - lastAt,
          guard: pendingGuard,
        });
        lastAt = now;
      },
      onFinish: (f) => {
        const latencyMs = Date.now() - started;
        const flags = computeFlags({
          input,
          steps: stepsLog,
          latencyMs,
          totalTokens: f.totalUsage.totalTokens ?? 0,
          prior,
          extra: toolFlags,
        });
        logEvent("turn_end", {
          sessionId,
          turnId,
          finishReason: f.finishReason,
          totalUsage: f.totalUsage,
          steps: stepsLog.length,
          latencyMs,
          endedWith: endedWith(stepsLog),
          flags,
        });
        for (const flag of flags) recordAudit(sessionId, turnId, "flag", { flag });
        // Knowledge graph: fire-and-forget, never blocks or breaks the response.
        try {
          extractTurn({ sessionId, turnId, input, steps: stepsLog });
        } catch (e) {
          console.error("[graph] failed to schedule extraction", e);
        }
      },
      onError: ({ error }) => {
        logEvent("error", {
          sessionId,
          turnId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          latencyMs: Date.now() - started,
        });
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) => (part.type === "start" ? { turnId } : undefined),
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onError: (e) => (e instanceof Error ? e.message : String(e)),
      onFinish: ({ messages: all }) => {
        saveMessages(sessionId, all);
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof MissingKeyError) return Response.json({ error: dictMessages(localeFromRequest(req)).tutor.errors.missingKey, code: "missing_key" }, { status: 400 });
    logEvent("error", { sessionId, turnId, error: message, stack: e instanceof Error ? e.stack : undefined, latencyMs: Date.now() - started });
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Replaces the session messages (simple; sessions are small). */
function saveMessages(sessionId: string, all: UIMessage[]) {
  const base = Date.now();
  db.transaction((tx) => {
    tx.delete(messagesTable).where(eq(messagesTable.sessionId, sessionId)).run();
    all.forEach((m, i) => {
      tx.insert(messagesTable)
        .values({ id: `${sessionId}:${m.id || `m${i}`}`, sessionId, role: m.role, parts: cleanParts(m), createdAt: base + i })
        .run();
    });
    tx.update(sessions).set({ updatedAt: base }).where(eq(sessions.id, sessionId)).run();
  });
}

function cleanParts(m: UIMessage): UIMessage["parts"] {
  return m.parts.map((p) => (p.type === "text" ? { ...p, text: stripInvisible(p.text) } : p));
}
