import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { LEGACY_LEVELS } from "./legacy-pt";

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, topic TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, parts TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, session_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, confidence INTEGER NOT NULL, verdict TEXT, feedback TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lesson_map (session_id TEXT PRIMARY KEY, steps TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, session_id TEXT NOT NULL, turn_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_session ON audit(session_id, ts);
CREATE TABLE IF NOT EXISTS graph_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, norm_title TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, summary TEXT NOT NULL, domain TEXT NOT NULL, mastery TEXT NOT NULL, mastery_score REAL NOT NULL, last_confidence INTEGER, evidence_count INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS graph_edges (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, type TEXT NOT NULL, label TEXT, UNIQUE(from_id, to_id, type));
CREATE INDEX IF NOT EXISTS graph_edges_from ON graph_edges(from_id);
CREATE INDEX IF NOT EXISTS graph_edges_to ON graph_edges(to_id);
CREATE TABLE IF NOT EXISTS graph_evidence (id TEXT PRIMARY KEY, node_id TEXT NOT NULL, session_id TEXT NOT NULL, check_id TEXT, kind TEXT NOT NULL, verdict TEXT, confidence INTEGER, text TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS graph_evidence_node ON graph_evidence(node_id, ts);
CREATE INDEX IF NOT EXISTS graph_evidence_session ON graph_evidence(session_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
`;

function init() {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, "app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  // Parallel build workers may race to add the same column: ignore "duplicate column".
  const addColumn = (sql: string) => {
    try {
      sqlite.exec(sql);
    } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  };
  // Additive migration: add any missing columns to sessions.
  const cols = (sqlite.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
  for (const c of ["request", "context", "goal", "level", "mode", "plan", "locale"]) {
    if (!cols.includes(c)) addColumn(`ALTER TABLE sessions ADD COLUMN ${c} TEXT`);
  }
  // Sessions created before i18n were all Portuguese.
  sqlite.exec("UPDATE sessions SET locale = 'pt-BR' WHERE locale IS NULL");
  // Old stored level labels -> stable keys.
  const fixLevel = sqlite.prepare("UPDATE sessions SET level = ? WHERE level = ?");
  for (const [label, key] of Object.entries(LEGACY_LEVELS)) fixLevel.run(key, label);
  const checkCols = (sqlite.prepare("PRAGMA table_info(checks)").all() as { name: string }[]).map((c) => c.name);
  if (!checkCols.includes("node_id")) addColumn("ALTER TABLE checks ADD COLUMN node_id TEXT");
  return drizzle(sqlite, { schema });
}

const g = globalThis as unknown as { __db5?: ReturnType<typeof init> };
export const db = (g.__db5 ??= init());
export const newId = () => crypto.randomUUID();
