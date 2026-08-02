CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  xp INTEGER DEFAULT 0,
  rank TEXT DEFAULT 'Recruit',
  streak INTEGER DEFAULT 0,
  last_forge_date TEXT,
  completed_missions TEXT DEFAULT '[]',
  unlocked_campaigns TEXT DEFAULT '["retriever"]',
  mentor_questions_asked INTEGER DEFAULT 0,
  chat_queries_run INTEGER DEFAULT 0,
  active_campaign_id TEXT,
  current_mission_index INTEGER DEFAULT 0,
  build_slot_values TEXT DEFAULT '{}',
  build_timer_seconds INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forged_agents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  campaign_id TEXT,
  name TEXT,
  lyzr_agent_id TEXT,
  config TEXT,
  original_config TEXT,
  lyzr_payload TEXT,
  forge_score INTEGER,
  forge_time INTEGER,
  xp_earned INTEGER,
  version INTEGER DEFAULT 1,
  forged_at TEXT DEFAULT (datetime('now')),
  last_edited_at TEXT
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id TEXT,
  badge_key TEXT,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  char_count INTEGER DEFAULT 0,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_defs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT,
  params_schema TEXT,       -- JSON: { paramName: "string" | "number" | "boolean" }
  endpoint_url TEXT,        -- real webhook URL, or "builtin:weather" sentinel
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redteam_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,        -- forged_agents.id (internal row id)
  agent_version INTEGER NOT NULL, -- forged_agents.version at run time, for before/after re-forge comparison
  category TEXT NOT NULL,        -- e.g. prompt_injection, off_topic_bait, data_exfiltration, jailbreak_roleplay, contradiction_trap
  prompt TEXT NOT NULL,          -- real, Redcap-generated, tailored to the target agent's role+instructions
  response TEXT NOT NULL,        -- the target agent's real reply
  verdict TEXT NOT NULL,         -- 'held' | 'broke' — Redcap's real judgment, overridden to 'broke' by the regex backstop when data_exfiltration actually leaks
  reason TEXT,
  suggestion TEXT,
  run_at TEXT DEFAULT (datetime('now'))
);
