import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, "agentforge.db");

export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Migration guard: add columns introduced after the initial schema for
// databases created before they existed.
const forgedAgentsCols = db.prepare("PRAGMA table_info(forged_agents)").all() as {
  name: string;
}[];
if (!forgedAgentsCols.some((c) => c.name === "lyzr_payload")) {
  db.exec("ALTER TABLE forged_agents ADD COLUMN lyzr_payload TEXT");
}
if (!forgedAgentsCols.some((c) => c.name === "template_id")) {
  db.exec("ALTER TABLE forged_agents ADD COLUMN template_id TEXT");
}

const usersCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!usersCols.some((c) => c.name === "completed_missions")) {
  db.exec("ALTER TABLE users ADD COLUMN completed_missions TEXT DEFAULT '[]'");
}
if (!usersCols.some((c) => c.name === "unlocked_campaigns")) {
  db.exec("ALTER TABLE users ADD COLUMN unlocked_campaigns TEXT DEFAULT '[\"retriever\"]'");
}
if (!usersCols.some((c) => c.name === "mentor_questions_asked")) {
  db.exec("ALTER TABLE users ADD COLUMN mentor_questions_asked INTEGER DEFAULT 0");
}
if (!usersCols.some((c) => c.name === "chat_queries_run")) {
  db.exec("ALTER TABLE users ADD COLUMN chat_queries_run INTEGER DEFAULT 0");
}
if (!usersCols.some((c) => c.name === "display_name")) {
  db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
}
if (!usersCols.some((c) => c.name === "active_campaign_id")) {
  db.exec("ALTER TABLE users ADD COLUMN active_campaign_id TEXT");
}
if (!usersCols.some((c) => c.name === "current_mission_index")) {
  db.exec("ALTER TABLE users ADD COLUMN current_mission_index INTEGER DEFAULT 0");
}
if (!usersCols.some((c) => c.name === "build_slot_values")) {
  db.exec("ALTER TABLE users ADD COLUMN build_slot_values TEXT DEFAULT '{}'");
}
if (!usersCols.some((c) => c.name === "build_timer_seconds")) {
  db.exec("ALTER TABLE users ADD COLUMN build_timer_seconds INTEGER DEFAULT 0");
}
