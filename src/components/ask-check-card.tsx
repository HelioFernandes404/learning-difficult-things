"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/telemetry";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export type CheckResult = { answer: string; confidence: number };

export function AskCheckCard({
  question,
  hint,
  result,
  onSubmit,
}: {
  question: string;
  hint?: string;
  result?: CheckResult;
  onSubmit: (r: CheckResult) => void;
}) {
  const t = useT();
  const labels = t.cards.confidenceLevels;
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const answered = !!result;
  useEffect(() => {
    if (!answered) track("card_shown", { card: "ask_check", question: question.slice(0, 200) });
  }, [answered, question]);

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-l-4 border-l-primary bg-card font-sans shadow-soft">
      <div className="space-y-3 p-4">
        <div className="text-xs font-semibold tracking-wider text-primary uppercase">{t.cards.check}</div>
        <div className="font-serif text-[1.0625rem] leading-snug">{question}</div>
        {hint && <div className="text-xs text-muted-foreground">{t.cards.hint} {hint}</div>}
        {result ? (
          <div className="space-y-1.5 text-sm">
            <div className="rounded-xl bg-user-bubble p-3 whitespace-pre-wrap">{result.answer}</div>
            <div className="text-xs text-muted-foreground">
              {t.cards.confidence}: {result.confidence}/5 ({labels[result.confidence - 1]})
            </div>
          </div>
        ) : (
          <>
            <Textarea
              placeholder={t.cards.answerPlaceholder}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
            />
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t.cards.confidence}: {confidence}/5</span>
                <span className="text-foreground">{labels[confidence - 1]}</span>
              </div>
              <Slider min={1} max={5} step={1} value={[confidence]} onValueChange={(v) => setConfidence(Array.isArray(v) ? v[0] : v)} />
              <div className="flex justify-between text-[0.6875rem] text-muted-foreground">
                <span>{labels[0]}</span>
                <span>{labels[4]}</span>
              </div>
            </div>
            <Button disabled={!answer.trim()} onClick={() => onSubmit({ answer: answer.trim(), confidence })}>
              {t.cards.submitAnswer}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
