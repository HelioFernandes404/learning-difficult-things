/**
 * Format guardrail (used by prepareStep in route.ts and scripts/eval.ts).
 *
 * AI SDK v5 only decides the next step AFTER a step with tool calls; a text-only step ends
 * the response and cannot be "reopened" (prepareStep runs before the step).
 * So the guard acts only when the previous step called preparation tools:
 * - previous step had only set_lesson_map: toolChoice "required" (it cannot stop with text only;
 *   it must show a visual or call ask_check);
 * - a visual was already shown and the turn has not ended in an interaction: toolChoice "required"
 *   (does not force a specific ask_check, so offer_choices stays possible);
 * After grade_check/save_concept a tool is also required (the turn must end in ask_check
 * or offer_choices).
 * Turns that already have ask_check OR offer_choices (both terminal) are left free.
 */
type StepLike = { toolCalls: { toolName: string }[] };

type Choice = { toolChoice: "required" };

export function formatGuard({ steps }: { steps: StepLike[] }): Choice | undefined {
  if (!steps.length) return undefined;
  const names = steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
  if (names.includes("ask_check") || names.includes("offer_choices")) return undefined;
  if (names.some((n) => n.startsWith("show_"))) return { toolChoice: "required" };
  if (steps[steps.length - 1].toolCalls.length) return { toolChoice: "required" };
  return undefined;
}
