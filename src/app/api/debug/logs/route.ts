import { readLogs } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  return Response.json(readLogs(limit));
}
