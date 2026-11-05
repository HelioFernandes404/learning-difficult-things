import { continueNodes, loadGraph, sessionGraph } from "@/lib/graph/store";
import type { Mastery } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("sessionId")) return Response.json(sessionGraph(sp.get("sessionId")!));
  if (sp.get("continue")) return Response.json(continueNodes());
  const mastery = sp.get("mastery")?.split(",").filter(Boolean) as Mastery[] | undefined;
  return Response.json(loadGraph({ domain: sp.get("domain") || undefined, mastery, q: sp.get("q") || undefined }));
}
