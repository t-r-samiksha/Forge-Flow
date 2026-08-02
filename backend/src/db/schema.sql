CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,  -- Supabase auth.users.id (real, verified UUID) going forward; see §36 for the legacy slugify(email) migration path
  email TEXT,           -- real, verified email from Supabase's JWT — first populated on real sign-in, null for any row that predates real auth
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
  last_edited_at TEXT,
  template_id TEXT  -- which freeform template (?template=<id>) this build started from, null for genuine "Start from scratch" or pre-this-fix agents
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
  user_id TEXT,  -- owner, for real ownership checks (§36) — nullable so pre-migration rows aren't dropped, backfilled via forged_agents.lyzr_agent_id join where resolvable
  filename TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  char_count INTEGER DEFAULT 0,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_defs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  user_id TEXT,  -- owner, for real ownership checks (§36) — nullable, same backfill note as knowledge_docs
  tool_name TEXT NOT NULL,
  description TEXT,
  params_schema TEXT,       -- JSON: { paramName: "string" | "number" | "boolean" }
  endpoint_url TEXT,        -- real webhook URL, or "builtin:weather" sentinel
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crews (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  orchestrator_agent_id TEXT NOT NULL,  -- forged_agents.id (internal row id) of the real shipped orchestrator
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crew_members (
  crew_id TEXT NOT NULL,
  forged_agent_id TEXT NOT NULL,  -- forged_agents.id (internal row id) of the real shipped sub-agent
  role_label TEXT NOT NULL        -- free-text label from Level 1, matched against the orchestrator's real ROUTE_TO: <role_label>
);

CREATE TABLE IF NOT EXISTS redteam_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,        -- forged_agents.id (internal row id)
  user_id TEXT,                  -- owner, for real ownership checks (§36) — nullable, same backfill note as knowledge_docs
  agent_version INTEGER NOT NULL, -- forged_agents.version at run time, for before/after re-forge comparison
  category TEXT NOT NULL,        -- e.g. prompt_injection, off_topic_bait, data_exfiltration, jailbreak_roleplay, contradiction_trap
  prompt TEXT NOT NULL,          -- real, Redcap-generated, tailored to the target agent's role+instructions
  response TEXT NOT NULL,        -- the target agent's real reply
  verdict TEXT NOT NULL,         -- 'held' | 'broke' — Redcap's real judgment, overridden to 'broke' by the regex backstop when data_exfiltration actually leaks
  reason TEXT,
  suggestion TEXT,
  run_at TEXT DEFAULT (datetime('now'))
);
