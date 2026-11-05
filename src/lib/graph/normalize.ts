import { GRAPH_STOP_WORDS_PT } from "@/lib/legacy-pt";

/** Graph title normalization: lowercase, accents stripped, no parentheses/punctuation. */
export function normTitle(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set([...GRAPH_STOP_WORDS_PT, "the", "of", "and"]);

const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

export function tokens(t: string): string[] {
  return normTitle(t)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

export function jaccard(a: string, b: string) {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / new Set([...sa, ...sb]).size;
}

/** Mesmo conceito? Igual apos normalizar, ou tokens quase iguais. */
export function sameTitle(a: string, b: string) {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (na === nb) return true;
  return jaccard(a, b) >= 0.75;
}
