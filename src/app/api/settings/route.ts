import { getT } from "@/i18n/server";
import { z } from "zod";
import { requireJson } from "@/lib/security";
import { logEvent } from "@/lib/log";
import { recordAudit } from "@/lib/tutor/audit-db";
import { EFFORTS, PROVIDERS, publicConfig, readDbSettings, writeSetting, type SettingKey } from "@/lib/settings";

export async function GET() {
  return Response.json(publicConfig());
}

const makeBody = (invalidUrl: string) => z.object({
  provider: z.enum(PROVIDERS).optional(),
  apiKey: z.string().trim().max(500).optional(),
  clearKey: z.boolean().optional(),
  baseUrl: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//.test(v), invalidUrl).optional(),
  model: z.string().trim().max(200).optional(),
  reasoningEffort: z.enum(EFFORTS).optional(),
  graphModel: z.string().trim().max(200).optional(),
});

export async function PUT(req: Request) {
  const notJson = requireJson(req);
  if (notJson) return notJson;
  const { t } = await getT();
  const parsed = makeBody(t.api.settings.baseUrlScheme).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? t.api.invalidData }, { status: 400 });
  const b = parsed.data;
  const before = readDbSettings();
  const changed: string[] = [];
  const set = (k: SettingKey, v: string | undefined) => {
    if (v === undefined) return;
    if (v === "") {
      if (before[k] !== undefined) {
        writeSetting(k, null);
        changed.push(k);
      }
    } else if (before[k] !== v) {
      writeSetting(k, v);
      changed.push(k);
    }
  };
  set("provider", b.provider);
  set("baseUrl", b.baseUrl);
  set("model", b.model);
  set("reasoningEffort", b.reasoningEffort);
  set("graphModel", b.graphModel);
  if (b.clearKey) {
    if (before.apiKey) {
      writeSetting("apiKey", null);
      changed.push("apiKey");
    }
  } else if (b.apiKey) {
    writeSetting("apiKey", b.apiKey);
    changed.push("apiKey");
  }
  if (changed.length) {
    logEvent("settings_changed", { fields: changed });
    recordAudit("settings", null, "settings_changed", { fields: changed });
  }
  return Response.json({ ...publicConfig(), changed });
}
