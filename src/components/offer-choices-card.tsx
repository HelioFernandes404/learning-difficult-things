"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/telemetry";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export type ChoiceOption = { id: string; label: string; description?: string };
export type ChoiceResult = { choiceId: string; label: string; other?: string };

export function OfferChoicesCard({
  question,
  options,
  allowOther,
  result,
  onSubmit,
}: {
  question: string;
  options: ChoiceOption[];
  allowOther?: boolean;
  result?: ChoiceResult;
  onSubmit: (r: ChoiceResult) => void;
}) {
  const t = useT();
  const [other, setOther] = useState("");
  const done = !!result;
  useEffect(() => {
    if (!done) track("card_shown", { card: "offer_choices", question: question.slice(0, 200), options: options.length });
  }, [done, question, options.length]);
  const submit = (r: ChoiceResult) => {
    track("choice_picked", { choiceId: r.choiceId, other: !!r.other });
    onSubmit(r);
  };

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-l-4 border-l-primary bg-card font-sans shadow-soft">
      <div className="space-y-3 p-4">
        <div className="text-xs font-semibold tracking-wider text-primary uppercase">{t.cards.choice}</div>
        <div className="font-serif text-[1.0625rem] leading-snug">{question}</div>
        <div className="flex flex-col gap-2">
          {options.map((o) => {
            const selected = result?.choiceId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={done}
                onClick={() => submit({ choiceId: o.id, label: o.label })}
                className={
                  "rounded-2xl border px-4 py-2 text-left text-sm transition-colors " +
                  (selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : done
                      ? "opacity-50"
                      : "hover:border-primary hover:bg-primary/10 hover:text-primary")
                }
              >
                <div className="font-medium">{o.label}</div>
                {o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}
              </button>
            );
          })}
        </div>
        {result?.other ? (
          <div className="rounded-xl border border-primary bg-primary/10 p-3 text-sm whitespace-pre-wrap">{result.other}</div>
        ) : (
          allowOther &&
          !done && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (other.trim()) submit({ choiceId: "other", label: t.cards.other, other: other.trim() });
              }}
            >
              <Input placeholder={t.cards.otherPlaceholder} value={other} onChange={(e) => setOther(e.target.value)} />
              <Button type="submit" disabled={!other.trim()}>
                {t.cards.send}
              </Button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
