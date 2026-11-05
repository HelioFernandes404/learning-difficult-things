import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  request: text("request"),
  context: text("context"),
  goal: text("goal"),
  level: text("level"),
  mode: text("mode"), // null | "practice"
  plan: text("plan"), // planned learning path (graph), text
  locale: text("locale"), // "en" | "pt-BR": language the tutor uses in this session
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  parts: text("parts", { mode: "json" }).notNull(), // UIMessage.parts
  createdAt: integer("created_at").notNull(),
});

export const concepts = sqliteTable("concepts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  source: text("source", { enum: ["ai", "user"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const checks = sqliteTable("checks", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  confidence: integer("confidence").notNull(), // 1-5
  verdict: text("verdict", { enum: ["correct", "partial", "wrong"] }),
  feedback: text("feedback"),
  nodeId: text("node_id"),
  createdAt: integer("created_at").notNull(),
});

export type LessonStep = { id: string; title: string; status: "todo" | "current" | "done" };

export const lessonMaps = sqliteTable("lesson_map", {
  sessionId: text("session_id").primaryKey(),
  steps: text("steps", { mode: "json" }).$type<LessonStep[]>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Audit trail: tool side effects + anomaly flags per turn. */
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  ts: integer("ts").notNull(),
  sessionId: text("session_id").notNull(),
  turnId: text("turn_id"),
  kind: text("kind").notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
});

export type NodeKind = "concept" | "proposition" | "skill";
export type Mastery = "unseen" | "learning" | "mastered" | "misconception";
export type EdgeType = "prerequisite" | "part_of" | "related" | "contrasts" | "example_of";
export type EvidenceKind = "taught" | "check" | "note" | "misconception";

/** Knowledge graph persisted across sessions. */
export const graphNodes = sqliteTable("graph_nodes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  normTitle: text("norm_title").notNull().unique(),
  kind: text("kind").$type<NodeKind>().notNull(),
  summary: text("summary").notNull(),
  domain: text("domain").notNull(),
  mastery: text("mastery").$type<Mastery>().notNull(),
  masteryScore: real("mastery_score").notNull(),
  lastConfidence: integer("last_confidence"),
  evidenceCount: integer("evidence_count").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** from -> to. prerequisite: "from" is a prerequisite of "to". part_of/example_of: "from" is a part/example of "to". */
export const graphEdges = sqliteTable("graph_edges", {
  id: text("id").primaryKey(),
  fromId: text("from_id").notNull(),
  toId: text("to_id").notNull(),
  type: text("type").$type<EdgeType>().notNull(),
  label: text("label"),
});

export const graphEvidence = sqliteTable("graph_evidence", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  sessionId: text("session_id").notNull(),
  checkId: text("check_id"),
  kind: text("kind").$type<EvidenceKind>().notNull(),
  verdict: text("verdict"),
  confidence: integer("confidence"),
  text: text("text").notNull(),
  ts: integer("ts").notNull(),
});


export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
