import { generateText } from "ai";
import { getT } from "@/i18n/server";
import { z } from "zod";
import { getModel, reasoningOptions } from "@/lib/llm";
import { EFFORTS, PROVIDERS, needsKey } from "@/lib/settings";
import { requireJson } from "@/lib/security";
import { friendlyError, mergeConfig, needsKeyForOther } from "@/lib/settings-server";

const body = z
  .object({
    provider: z.enum(PROVIDERS),
    apiKey: z.string(),
    baseUrl: z.string(),
    model: z.string(),
    reasoningEffort: z.enum(EFFORTS),
  })
  .partial();

export async function POST(req: Request) {
  const bad = requireJson(req);
  if (bad) return bad;
  const { t } = await getT();
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  const over = parsed.success ? parsed.data : {};
  if (needsKeyForOther(over)) return Response.json({ ok: false, latencyMs: 0, model: "", error: t.api.settings.otherKeyNeeded }, { status: 400 });
  const cfg = mergeConfig(over);
  if (needsKey(cfg.provider) && !cfg.apiKey) return Response.json({ ok: false, latencyMs: 0, model: cfg.model, error: t.api.settings.pasteKeyFirst });
  const t0 = Date.now();
  try {
    await generateText({
      model: getModel(cfg.model, cfg),
      prompt: "reply with just: ok",
      maxOutputTokens: 64,
      providerOptions: reasoningOptions(cfg),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30000),
    });
    return Response.json({ ok: true, latencyMs: Date.now() - t0, model: cfg.model });
  } catch (e) {
    return Response.json({ ok: false, latencyMs: Date.now() - t0, model: cfg.model, error: friendlyError(e, cfg.baseUrl, t) });
  }
}
