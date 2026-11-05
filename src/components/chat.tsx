"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { ArrowUp, Brain, BookMarked, CheckCircle2, Loader2, Map as MapIcon, Wrench } from "lucide-react";
import { Markdown } from "./markdown";
import { isVisualName, VisualPart } from "./visuals";
import { AskCheckCard, type CheckResult } from "./ask-check-card";
import { setTelemetrySession, setTelemetryTurn, track } from "@/lib/telemetry";
import { useT } from "@/i18n/client";
import { OfferChoicesCard, type ChoiceOption, type ChoiceResult } from "./offer-choices-card";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

function Badge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="my-1.5 flex w-fit items-center gap-1.5 rounded-full border bg-surface px-2.5 py-0.5 font-sans text-xs text-muted-foreground [&_svg]:size-3">
      {icon}
      {children}
    </div>
  );
}

export function Chat({
  sessionId,
  firstMessage,
  initialMessages,
  onActivity,
}: {
  sessionId: string;
  firstMessage: string;
  initialMessages: UIMessage[];
  onActivity: () => void;
}) {
  const t = useT();
  const { messages, sendMessage, status, error, addToolResult } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, id }) => ({ body: { messages, sessionId: id } }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  setTelemetrySession(sessionId);
  setTelemetryTurn(([...messages].reverse().find((m) => m.role === "assistant")?.metadata as { turnId?: string } | undefined)?.turnId ?? null);
  const [input, setInput] = useState("");
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  // New session (no messages): start the conversation with the topic.
  useEffect(() => {
    if (started.current || initialMessages.length > 0) return;
    started.current = true;
    sendMessage({ text: firstMessage });
  }, [initialMessages.length, sendMessage, firstMessage]);

  useEffect(() => {
    if (status === "ready") onActivity();
  }, [status, onActivity]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  async function submitCheck(part: ToolPart, r: CheckResult) {
    const res = await fetch("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, question: String(part.input?.question ?? ""), ...r }),
    });
    const row = (await res.json()) as { id: string };
    track("check_answered", { checkId: row.id, confidence: r.confidence, answerLength: r.answer.length });
    addToolResult({ tool: "ask_check", toolCallId: part.toolCallId, output: { ...r, checkId: row.id } });
    onActivity();
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 py-8">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={m.role === "user" ? "max-w-[80%] rounded-2xl bg-user-bubble px-4 py-2.5 font-sans" : "max-w-full"}>
                {m.parts.map((p, i) => {
                  if (p.type === "text") return m.role === "user" ? <div key={i} className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{p.text}</div> : <Markdown key={i} serif>{p.text}</Markdown>;
                  if (!p.type.startsWith("tool-")) return null;
                  const tp = p as unknown as ToolPart;
                  const name = p.type.slice(5);
                  if (name === "ask_check") {
                    if (tp.state === "input-streaming") return null;
                    const result = tp.state === "output-available" ? (tp.output as unknown as CheckResult) : undefined;
                    return (
                      <AskCheckCard
                        key={i}
                        question={String(tp.input?.question ?? "")}
                        hint={tp.input?.hint as string | undefined}
                        result={result}
                        onSubmit={(r) => submitCheck(tp, r)}
                      />
                    );
                  }
                  if (name === "offer_choices") {
                    if (tp.state === "input-streaming") return null;
                    const result = tp.state === "output-available" ? (tp.output as unknown as ChoiceResult) : undefined;
                    return (
                      <OfferChoicesCard
                        key={i}
                        question={String(tp.input?.question ?? "")}
                        options={(tp.input?.options as ChoiceOption[] | undefined) ?? []}
                        allowOther={tp.input?.allowOther as boolean | undefined}
                        result={result}
                        onSubmit={(r) => {
                          addToolResult({ tool: "offer_choices", toolCallId: tp.toolCallId, output: r });
                          onActivity();
                        }}
                      />
                    );
                  }
                  if (isVisualName(name)) return <VisualPart key={i} name={name} state={tp.state} input={tp.input} />;
                  if (tp.state !== "output-available") return <Badge key={i} icon={<Loader2 className="animate-spin" />}>{name}...</Badge>;
                  if (name === "save_concept") return <Badge key={i} icon={<BookMarked />}>{t.chat.conceptSaved(String(tp.input?.title))}</Badge>;
                  if (name === "set_lesson_map") return <Badge key={i} icon={<MapIcon />}>{t.chat.mapUpdated}</Badge>;
                  if (name === "grade_check") return <Badge key={i} icon={<CheckCircle2 />}>{t.chat.checkGraded(String(tp.input?.verdict))}</Badge>;
                  return <Badge key={i} icon={<Wrench />}>{name}</Badge>;
                })}
              </div>
            </div>
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 font-serif text-sm text-muted-foreground">
              <Brain className="size-4 animate-pulse text-primary" /> {t.chat.thinking}
            </div>
          )}
          {error && <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {error.message.includes("/settings") ? (
                <>
                  {t.chat.configureKeyBefore} <Link href="/settings" className="font-medium underline">{t.chat.configureKeyLink}</Link> {t.chat.configureKeyAfter}
                </>
              ) : (
                <>{t.chat.errorPrefix} {error.message}</>
              )}
            </div>}
          <div ref={bottom} />
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-3xl border bg-card p-2 pl-4 shadow-soft transition-colors focus-within:border-primary/60">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.chat.placeholder}
            rows={1}
            className="field-sizing-content max-h-48 min-h-10 flex-1 resize-none self-center bg-transparent py-2 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label={t.chat.send}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-[#c6613f] disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
