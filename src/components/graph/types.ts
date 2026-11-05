export type Mastery = "unseen" | "learning" | "mastered" | "misconception";
export type EdgeType = "prerequisite" | "part_of" | "related" | "contrasts" | "example_of";

export type GNodeDTO = {
  id: string;
  title: string;
  kind: "concept" | "proposition" | "skill";
  summary: string;
  domain: string;
  mastery: Mastery;
  masteryScore: number;
  lastConfidence: number | null;
  evidenceCount: number;
};
export type GEdgeDTO = { id: string; fromId: string; toId: string; type: EdgeType; label: string | null };
export type GraphData = {
  nodes: GNodeDTO[];
  edges: GEdgeDTO[];
  domains: string[];
  stats: { total: number; unseen: number; learning: number; mastered: number; misconception: number; overconfident: number };
};

/** Colors per mastery (design system tokens). */
export const MASTERY_COLOR: Record<Mastery, string> = {
  unseen: "var(--muted-foreground)",
  learning: "var(--primary)",
  mastered: "var(--success)",
  misconception: "var(--destructive)",
};

/** Prerequisite ancestors up to mastered nodes (inclusive), plus the goal itself. */
export function pathSet(goalId: string, edges: GEdgeDTO[], nodes: GNodeDTO[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  const stack = [goalId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id) || !byId.has(id)) continue;
    out.add(id);
    if (id !== goalId && byId.get(id)!.mastery === "mastered") continue;
    for (const e of edges) if (e.type === "prerequisite" && e.toId === id) stack.push(e.fromId);
  }
  return out;
}
