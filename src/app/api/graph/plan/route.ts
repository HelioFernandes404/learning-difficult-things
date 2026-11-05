import { getT } from "@/i18n/server";
import { localeFromRequest } from "@/i18n";
import { planGoal } from "@/lib/graph/plan";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { t } = await getT();
  const { goal } = (await req.json()) as { goal?: string };
  if (!goal?.trim()) return Response.json({ error: t.api.goalRequired }, { status: 400 });
  try {
    return Response.json(await planGoal(goal.trim(), localeFromRequest(req)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
