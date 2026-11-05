import { getT } from "@/i18n/server";
import { mergeNodes } from "@/lib/graph/store";

export async function POST(req: Request) {
  const { t } = await getT();
  const { fromId, intoId } = (await req.json()) as { fromId?: string; intoId?: string };
  if (!fromId || !intoId || fromId === intoId) return Response.json({ error: t.api.mergeIdsRequired }, { status: 400 });
  try {
    mergeNodes(fromId, intoId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
