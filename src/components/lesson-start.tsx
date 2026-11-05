"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEVEL_KEYS } from "@/lib/lesson-request";
import { useT } from "@/i18n/client";
import { startSessionFromGraph } from "@/lib/graph/client";
import { MASTERY_COLOR, type GNodeDTO } from "@/components/graph/types";

export type StartData = { request: string; context?: string; goal?: string; level?: string };

export function LessonStart({ onSubmit }: { onSubmit: (d: StartData) => Promise<void> }) {
  const t = useT();
  const [request, setRequest] = useState("");
  const [context, setContext] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const [cont, setCont] = useState<GNodeDTO[]>([]);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    fetch("/api/graph?continue=1").then((r) => r.json()).then(setCont).catch(() => {});
  }, []);

  async function submit() {
    if (!request.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ request, context, goal, level });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="font-serif text-4xl font-medium tracking-tight">{t.lesson.heading}</h2>
          <p className="text-sm text-muted-foreground">{t.lesson.subheading}</p>
        </div>
        <div className="rounded-3xl border bg-card p-3 shadow-soft transition-colors focus-within:border-primary/60">
          <div className="flex items-end gap-2">
            <textarea
              ref={ref}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label={t.lesson.requestLabel}
              placeholder={t.lesson.placeholder}
              className="field-sizing-content max-h-64 min-h-20 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!request.trim() || busy}
              aria-label={t.lesson.start}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-[#c6613f] disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 px-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
            >
              <ChevronDown className={`size-4 transition-transform ${more ? "rotate-180" : ""}`} /> {t.lesson.moreContext}
            </button>
            <p className="text-xs text-muted-foreground">{t.lesson.enterHint}</p>
          </div>
          {more && (
            <div className="mt-3 space-y-3 border-t px-2 pt-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t.lesson.contextLabel}</span>
                <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder={t.lesson.contextPlaceholder} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t.lesson.goalLabel}</span>
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  className="min-h-0"
                  placeholder={t.lesson.goalPlaceholder}
                />
              </label>
              <div className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t.lesson.levelLabel}</span>
                <div className="flex flex-wrap gap-2">
                  {LEVEL_KEYS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLevel(level === l ? "" : l)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${level === l ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      {t.lesson.levels[l]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {cont.length > 0 && (
          <div className="space-y-2 rounded-2xl border bg-card p-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">{t.lesson.continueTitle}</h3>
            {cont.map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-sm">
                <span style={{ color: MASTERY_COLOR[n.mastery] }} title={t.lesson.mastery[n.mastery]}>●</span>
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <button className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted" onClick={() => startSessionFromGraph({ title: n.title, domain: n.domain })}>{t.lesson.teach}</button>
                <button className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted" onClick={() => startSessionFromGraph({ title: n.title, domain: n.domain, mode: "practice" })}>{t.lesson.practice}</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {t.lesson.examples.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border bg-transparent px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
              onClick={() => {
                setRequest(ex);
                ref.current?.focus();
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
