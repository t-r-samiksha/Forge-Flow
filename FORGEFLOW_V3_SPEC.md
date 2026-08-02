# ForgeFlow v3 — Real Agent Building Platform
### Complete Product & Technical Specification

**Status:** Planning document, written against a verified audit of the existing codebase (see Appendix A). Every "current" claim below is sourced from that audit, not assumption. Every "new" piece is scoped to be genuinely real — no simulated calls, no hardcoded data, no cosmetic config.

## Build status — complete, every known item

Nothing here is omitted. This table is the single source of truth for what's real vs. mock right now.

| # | Phase | What | Status |
|---|---|---|---|
| 1 | Qdrant RAG pipeline (backend) | Chunk to embed to Qdrant to per-query retrieval | Done, real smoke-tested (§15) |
| 1b | Knowledge upload UI (frontend) | File/paste upload, doc list, delete | Done |
| 1c | Build-mission code panel fix | Remove fictional retriever=retriever, unlock real qdrant_setup.py, add chat_handler.py | Done, shipped as part of the freeform builder's CodePanel/codegen.ts (§17) |
| 2 | Freeform agent builder | Blank-canvas agent creation, any name/role/instructions/model, no campaign lock. Campaigns become optional clonable templates, not required paths. | Done, logic real smoke-tested (§17), mission-style layout done (§19) |
| 2b | Mission-style layout revision | Replace the flat phase-chip UI with the old 3-column mission layout, reusing real Phase 2 logic underneath. Full spec in §3b. | Done, real Playwright-verified (§19) |
| 2c | Inline code-editor slot-filling | The code editor is the only input surface, real inline select/input slots two-way bound to AgentDraft; real per-field lint drives console/badges/gates. | Done, real Playwright-verified (§20). Extended to Tools and Crew's role-label list, which had drifted back to separate label forms — see §32 (FIX 2/3). |
| 2d | Freeform builder fixes | Sidebar clipping fixed; cloned templates surface values as placeholder hints, not filled-in defaults. | Done, Chrome-verified (§20). Firefox verification blocked by a sandbox network limitation, not a known cross-browser issue |
| 2e | Levels to Missions to Subtasks restructuring | Group the existing freeform missions under a Level-intro screen layer, matching the old campaign's 3-tier structure. Full spec in §3b's Levels subsection. | Done, real Playwright-verified (§21). Follow-up: templates now default-opt-in the Level their template implies (Retriever→Memory, Tool-Using Agent→Tools), structural only, field values still hints-only (§21) |
| 2f | Post-ship hub restored for freeform agents | Replace the freeform Ship screen's bare Test Console with the real post-ship hub, and fix all four destination screens' hidden campaign dependency so they work for freeform (campaignId: "custom") agents. | Done, real Playwright-verified (§22). Freeform's hub was missing View, and the legacy campaign ship screen had all 5 real options gated behind an unrelated test-chat step — both fixed in §34. |
| 2g | Persistent agent cards + freeform build resume | Restore card-grid access (Talk/View/Red Team/Compare/Certificate) to every previously-shipped freeform agent from /campaigns; autosave/resume an in-progress freeform build. Also fixes AgentDocScreen's own campaign dependency, flagged-not-fixed in §22. | Done, real Playwright-verified (§23). §23's resume was real but had an unflagged quick-close race (and the legacy campaign build had a second, independent resume bug) — both root-caused and fixed for real in §32 (FIX 4), plus Crew build resume added. Template-based builds never resumed at all, and a real cross-draft clobber bug in the unload flush was found and fixed in §34 (row 11). |
| 2h | /campaigns split into two sections | Separate templates ("Start a Build") from shipped-agent cards ("Your Agents"). | Done, real Playwright-verified (§24) |
| 2i | Red Team Arena live progress + achievement counter | Restore live incremental attack-by-attack display; red-team chats now count toward the "scientist" achievement. | Done, real Playwright + curl-verified (§26) |
| 2j | "Tool-Using Agent" / "Multi-Agent Crew" showing locked "soon" cards on /campaigns | Both cards showed lock/"soon" states contradicting already-real functionality (Tools since §18, Crew since §27) | Done, real Playwright-verified at the raw server-rendered-HTML level with a cache-ruled-out cold navigation (§30). Tool-Using Agent's lock was a real leftover campaign-progression gate (unlockAfter: "retriever" plus a store-gated LockedCard render), now removed. Multi-Agent Crew was confirmed already correctly unlocked in the live code and render — no change needed there; the earlier report was very likely a stale screenshot/cache, not a regression. |
| 3 | Tool execution loop | Real TOOL_CALL marker + backend interception + real webhook invocation | Done, real smoke-tested (§18) |
| 4 | Red Team Arena to Redcap | Dynamic attack generation + real LLM judgment | Done, real Playwright + curl-verified (§25). See naming-decision note at the end of §7 re: contradiction_pressure vs contradiction_trap. |
| 5 | Multi-agent crews | Real sub-agents + real orchestrator routing, own Level-based build flow (see expanded §6) | Done, real Playwright + curl-verified (§27). Header-overlap layout bug when embedding a sub-agent build, Define-the-Crew's label form, and Crew's missing build-resume — all fixed in §32. |
| 5b | MCP Tool Agent, scope decision | Real MCP (server discovery, tool listing, auth handshake) or just our existing webhook-based Tools (Phase 3) under the old reference's name? | Decided: same as Phase 3 Tools, not a separate Build Type. No real MCP protocol work planned. See §3b for the resolved text and rationale. |
| 6 | Nova platform-wide RAG | Ground Nova in real ForgeFlow docs via forgeflow_docs Qdrant collection | Done, real curl + Playwright-verified (§28) |
| 7 | Forge Score fix | Tool-config completeness currently auto-grants 15 flat points regardless of validity | Done, real curl + Playwright-verified (§29) |
| 7b | Backend accepts invalid tool config that the UI itself blocks | POST /api/agent/create doesn't reject an empty description or a malformed (non-http(s)://, non-builtin:) endpoint — only the frontend's ToolsEditor enforces this. Found while verifying §29 (had to bypass the UI via direct API call to construct a real invalid-config test case). | Done, real curl + Playwright-verified (§31, §35). /create and re-forge hard-reject with a 400 and itemized errors, reusing §29's own validity checks (one shared definition of "valid," not a third parallel one). The frontend ToolsEditor also gained a description check it was missing, found during real verification of this fix. §35 closed the one remaining real bypass §31 had explicitly left open: POST /api/tools/:agentId (post-ship tool registration) now runs the identical validateToolDef gate — all three real write paths a tool config can enter through are covered. |
| 8 | Story copy cleanup | Still says "Meridian Labs" in story screens | Deprioritized, not scheduled — explicit call: skip for now. |
| 9 | Story personalization (optional) | Let developer describe their real use case instead of a fixed narrative | Deprioritized, not scheduled — explicit call: skip for now, was always optional/undecided anyway. |
| 10 | Agent card template provenance + real agent deletion | Cards showed "Freeform" for every agent regardless of which ?template= it started from; no DELETE route existed anywhere, every prior removal was a manual verification-script cleanup | Done, real curl + Playwright-verified (§33). New nullable forged_agents.template_id column captures which template (if any) a freeform build started from; cards show the real template's title. New DELETE /api/agents/:userId/:agentId — real Lyzr delete + real dependent-row cleanup, ownership-checked, blocks (409) if the agent is a real Crew member/orchestrator rather than silently breaking crew routing. |
| 11 | Template-aware draft resume + chain-symmetric "← Back" navigation | Template builds never resumed a saved draft (unconditionally skipped); the unload-flush autosave clobbered other drafts on any tab close, even with zero edits; only the mission editor had a Back button — Build Overview, Level-intro, and Mission-overview screens (3 of the 4 real pages in the flow) had no way back at all | Done, real Playwright-verified (§34). Resume now compares the saved snapshot's templateId before restoring. Real clobber bug found and fixed via a hasPendingEditRef guard across all three build flows (Freeform/Crew/legacy). Every real page in the build chain (Build Overview → Level-intro → Mission-overview → Editor → Ship/Upload) now has a "← Back" to its true immediate predecessor, symmetric with the existing forward buttons; the true first page (Build Overview) correctly has none. Scoped to navigation that can't remount an already-shipped FreeformBuildScreen instance — every Crew-level case that would (Deploy→Orchestrator and its siblings) was investigated, found to risk creating a real duplicate Lyzr agent, and deliberately left unwired rather than shipped. |
| 12 | Real email authentication (Supabase) + closed the client-supplied-userId trust gap | Sign-in was identity-by-typed-string — any email typed once became a stable userId with zero verification, no email ever sent; every backend route trusted a client-supplied userId with no ownership check at all on knowledge_docs/tool_defs/redteam_runs/crews (no user_id column existed on any of them), and even the routes that did check ownership (agents.ts) trusted the unverified param. | Done, real Supabase magic-link auth + curl-verified with two real accounts and a real cross-user attack simulation (§36/§37). Every protected route now verifies a real Supabase JWT server-side (requireAuth middleware) and uses the verified identity for every ownership check, never a client-supplied param — confirmed live: a mismatched userId in the URL/body is silently ignored in favor of the real one, and a second real signed-in user gets a real 404 trying to read/chat/delete/tool-register on data they don't own. New user_id columns + real ownership checks added to knowledge_docs, tool_defs, redteam_runs, and crews (crew.ts's /create), closing the wider gap found while auditing this — not just the sign-in screen. Old email-only /login route removed entirely, not left running alongside real auth. |

**Data layer:** staying on SQLite through all of the above, see §16 for why and the revisit trigger.

---

## 1. What this platform is

ForgeFlow lets a developer build a real, working AI agent, freeform, not templated, backed by:

- Their own data, stored in a real vector database and genuinely retrieved at query time (not stuffed into a prompt once).
- Their own tools, genuinely invoked mid-conversation via a real execution loop.
- Optional multi-agent crews, where sub-agents are real independently-deployed agents coordinated by a real orchestrator.
- A real adversarial agent ("Redcap") that attacks the agent the developer just built and gives real, specific fixes.
- A platform-wide help agent ("Nova") that can answer any question about ForgeFlow itself, grounded in ForgeFlow's own docs via the same RAG pipeline users get.

The old model, fixed "campaigns" (Meridian/Airtel-themed guided missions with fill-in-the-blank slots), is demoted to optional starting templates. A developer can clone one and edit everything, or start from a fully blank canvas. Nothing is locked to a narrative.

---

## 2. Architecture

```
Browser
  |
  |--> Supabase Auth (real magic-link email, real JWT session) -- identity only, no app data (§36)
  |
  v
Next.js frontend (localhost:3000)  -- attaches the real Supabase session token to every API call
  |
  v
Express backend (localhost:4000)   -- requireAuth middleware verifies that token server-side (§36)
  |
  |--> SQLite (agentforge.db)              -- app state, config, history
  |--> Qdrant Cloud (free tier)             -- vector storage for knowledge
  |--> Google Gemini embeddings API         -- turns text into vectors
  +--> Lyzr Agent Platform (agent-prod.studio.lyzr.ai/v3) -- the actual LLM agent runtime
```

Supabase is used purely as the real identity provider (magic-link email delivery + session issuance/verification) — app data still lives entirely in this backend's own SQLite, not Supabase's Postgres.

---

## 3. What data we ask the user for, and when

| Step | What's asked | Required? |
|---|---|---|
| Sign in | Email only (no password) — a real magic link is emailed via Supabase and must be clicked to complete sign-in (§36) | Yes |
| New agent | Name, role, goal, instructions (free text) | Yes |
| New agent | Model + provider, temperature | Yes, with sane defaults |
| Knowledge (optional) | File upload or pasted text | No |
| Knowledge (optional) | top_k | Defaults to 4, editable |
| Tools (optional) | Tool name, description, JSON parameter schema, webhook URL (or built-in) | No |
| Crew (optional, separate Build Type, see §3b) | N sub-agent definitions + orchestrator routing instructions | No |
| Red Team run | Nothing extra, uses the agent's own real config | N/A, one click |

---

## 3b. Freeform Agent Builder — detailed spec

### New route structure

```
/build/new                -> blank canvas
/build/new?template=<id>  -> pre-fills fields from a template, still fully editable
/build/[campaignId]        -> legacy route, backward compat
```

### New data shape

```ts
interface AgentDraft {
  name: string;
  role: string;
  goal: string;
  instructions: string;
  model: string;
  provider: "google" | "openai" | "anthropic";
  temperature: number;
  knowledge?: { files?: File[]; pastedText?: string; topK: number; };
  tools?: ToolDef[];
}
```

### Templates vs. Build Types — the real distinction

Template = same skeleton, different starting hints. Retriever, Tool-Agent, Support Agent, Research Agent, etc. share the same AgentDraft shape, the same Level/Mission skeleton, and the same generated code files. Templates only change placeholder hints (§2d, hints only, never filled-in defaults) and which optional Levels they nudge toward (§21's follow-up — structural Level opt-in defaults, not field-value defaults). Do not build separate skeletons for single-agent templates.

Build Type = a structurally different object, chosen at a separate top-level entry point:
- Multi-Agent Crew (Phase 5) — N real shipped sub-agents + a real orchestrator. Own 4-level flow, own generated files. Full spec in §6.
- MCP Tool Agent — RESOLVED. Our real Tools (Phase 3) are a ForgeFlow-owned TOOL_CALL/webhook loop, genuinely not the actual MCP (Model Context Protocol) standard (server discovery, tool listing, auth handshake with external servers). Decision: "MCP Tool Agent" is treated as the same thing as our existing Phase 3 Tools system, just under the old reference's naming — a template, not a separate Build Type. No real MCP protocol support is planned. Rationale: real MCP support is a genuinely large, separable scope addition (external server discovery, arbitrary third-party credential/auth handling, a different execution model) that doesn't clearly pay for itself right now. This isn't a permanent door-closing decision — if real MCP support becomes something developers actually need later, it's a clean, separable addition on top of what already exists, not a rework. Practical effect: whenever an "MCP Tool Agent" template card appears in the UI, it should simply be a Tools-opted-in AgentDraft preset, identical in mechanism to any other template, with a Tools-mission hint nudging the developer to opt in — no new backend surface, no new Level/Mission skeleton, no new generated file. If anyone later revisits this, re-read this rationale before rebuilding anything real-MCP-shaped.

### Levels — grouping Missions

Level -> Missions (Level-intro screen) -> Mission (subtasks, own intro screen) -> the 3-column editor

LEVEL 1 — Root Agent (always required) — ~65 XP
| Mission | Subtasks | XP |
|---|---|---|
| 1. Identity | Name the agent - Set the role - Set the goal | +20 |
| 2. Instructions | Write the instructions | +25 |
| 3. Model & Tuning | Choose the model - Set the temperature | +20 |

LEVEL 2 — Memory (only if Knowledge opted in) — ~35 XP
| Mission | Subtasks | XP |
|---|---|---|
| 4. Configure Retrieval | Name the collection - Configure top_k | +35 |

LEVEL 3 — Tools (only if Tools opted in) — ~45 XP
| Mission | Subtasks | XP |
|---|---|---|
| 5. Define a Tool | Name the tool - Describe when to use it - Define parameters | +25 |
| 6. Wire the Tool | Choose built-in or webhook - Enter endpoint | +20 |

LEVEL 4 — Deploy (always required) — up to 80 XP
| Mission | Subtasks | XP |
|---|---|---|
| 7. Ship | Review the payload - Deploy the real agent | +50 |
| 8. Upload Your Knowledge (only if Knowledge opted in) | Add your documents - Confirm ingestion | +30 |

Real constraint shaping Mission 8's placement: Mission 8 cannot appear before Mission 7 (Ship) completes, Qdrant collections are named agent_<id>, which doesn't exist until the real Lyzr create call returns one, same reason Tools must be baked into the create call rather than attached post-ship (§18's deviation).

Template-driven Level defaults (§21 follow-up): Retriever defaults Level 2 (Memory) opted in; Tool-Using Agent defaults Level 3 (Tools) opted in. This is purely structural — the mission becomes visible/reachable in the Build Map without an extra click — never a field-value default; every real value inside that Level (collection name, top_k, tool name/description/endpoint) is still typed by the developer, shown only as a placeholder hint. A blank "Start from scratch" build or a Crew sub-agent build defaults both off, unchanged. The developer can remove a template-implied Level before starting it ("− Remove Memory"/"− Remove Tools" in the sidebar), same as they could always add one.

### Screen flow — mission-style layout, freeform logic

3-column layout: Build Map (mission list, grouped by Level) / Situation Report + live code editor (real inline slots) + real console / Live Agent diagram + Trade-offs-Pitfalls-Docs. Code editor is the only input surface (§2c/§20). Console validation is real, single source of truth (freeformLint).

### What happens to gamification

first_forge, zero_hallucination, speed_forge, unchanged, already generic. A scientist-style credit for genuinely using optional capabilities (real knowledge, real tool, real Red Team pass) rather than for merely reaching a mission. Red-team-triggered chats now correctly count toward this counter, per §26.

### What happens to existing campaigns

retriever and tool-using-agent become templates, per "Templates vs. Build Types" above, same skeleton, just starting hints. The (also resolved) MCP Tool Agent joins these as a third template. Neither template card is locked/gated anymore (§30) — both are immediately reachable, same as a blank build.

### Backend changes required

POST /api/agent/create already accepts a config object, no schema migration needed. campaign_id optional/nullable for freeform-created agents (fallback "custom").

---

## 4. How an agent gets deployed (real, step by step)

1. Developer fills the fields above (or edits a cloned template).
2. If knowledge was provided: backend chunks text, embeds per chunk, upserts vectors into agent_<id>.
3. Backend builds the real Lyzr payload (name, description, agent_role, agent_instructions, agent_goal, provider_id, model, temperature, top_p, store_messages). Knowledge corpus is NOT appended, retrieval happens per-query.
4. POST https://agent-prod.studio.lyzr.ai/v3/agents/ — real call, returns a real agent_id.
5. Backend stores the shipped agent in forged_agents.
6. Agent is live immediately at /agent/:id/chat.

Re-forge always creates a new agent_id and increments version, Lyzr agents aren't patchable.

Row 7b (resolved, §31): the backend now validates every tool's name/description/endpoint at both /create and re-forge, hard-rejecting with a 400 if any fail — the same checks §29's scoring uses, reused rather than duplicated. §29's scoring still applies its own partial-credit logic independently, as defense in depth.

---

## 5. How a chat message actually works

Query -> (if knowledge) embed+search Qdrant, prepend chunks -> real Lyzr call -> (if TOOL_CALL marker) execute real webhook, feed result back -> final response. A real ReAct-style loop we own, since Lyzr's tool_configs schema is built for pre-registered enterprise connectors, not arbitrary developer webhooks.

---

## 5b. Build-mission code panel — must mirror the real pipeline

Four real files, each a genuinely separate operation: agent.py (create call only, no retriever= / search_kwargs=), qdrant_setup.py (real, unlocked, ensure_collection/upsert_chunks/search), chat_handler.py (real per-message retrieval), tool_handler.py (real parse-execute-feed-back loop, Phase 3).

---

## 6. Multi-agent crews — own Build Type, own 4-level flow

Status: structurally different object, not a template variant, own top-level entry point.

LEVEL 1 — Define the Crew: how many sub-agents, each role label.
LEVEL 2 — Build Each Sub-Agent: one mission per sub-agent, reusing the exact real single-agent flow from §3b, each ships independently via §4, its own real agent_id.
LEVEL 3 — Orchestrator: routing instructions + real ROUTE_TO: <role> contract (same marker mechanism as TOOL_CALL). Orchestrator itself shipped as a real agent.
LEVEL 4 — Deploy Crew: ships orchestrator, confirms all sub-agents live, wires into crews/crew_members (§10).

Chat flow: message -> orchestrator (real call) -> if ROUTE_TO: <role> -> backend calls matching sub-agent (real call) -> return to user.

Generated files: crew_config.py (real composition), orchestrator.py (real routing, mirrors tool_handler.py's pattern).

---

## 7. Red Team Arena — dynamic, real, judged

One pre-provisioned Lyzr agent, "Redcap" (LYZR_REDCAP_AGENT_ID in .env, same pattern as Nova).

Mode ATTACK: target's real role+instructions -> 5 fresh adversarial prompts (prompt injection, off-topic bait, data exfiltration, jailbreak roleplay, contradiction pressure), tailored to that agent's actual domain.

Mode JUDGE: {prompt, response} -> {verdict: held|broke, reason, suggestion}, real structured judgment. data_exfiltration gets a deterministic regex backstop alongside the LLM judge, scoped to that category only.

```
POST /api/redteam/run/:agentId
  1. Load real config from forged_agents.lyzr_payload
  2. Redcap MODE:ATTACK -> 5 prompts
  3. For each: real chat call to target (production chat path) -> Redcap MODE:JUDGE
  4. Store all 5 in redteam_runs, tagged with agent_version
  5. Return results
```

Superseded by §26's two-endpoint split (/attack + /judge) for live incremental UI, same storage/version-tagging behavior.

Tagged by agent_version so a re-forge shows a real before/after.

Naming note (decided): the real backend ATTACK prompt requests the category key contradiction_trap; Redcap sometimes returns contradiction_pressure instead. Confirmed harmless, nothing in the codebase keys off the exact string. Decision: accept contradiction_pressure as the real, expected category name going forward rather than re-edit Redcap's Studio instructions (lower risk than touching a working, verified agent for a cosmetic mismatch). This doc's prose already used "contradiction pressure" throughout §7/§3b, so no textual change was needed, this note exists purely to record the decision for future reference, so it isn't re-flagged as an unresolved bug later.

---

## 8. Nova — platform-wide, RAG-grounded help agent

ForgeFlow's own docs chunked/embedded into forgeflow_docs Qdrant collection, same pipeline as user knowledge. Nova's chat becomes retrieval-grounded. On an agent's Doc page, backend additionally injects that agent's real config/forge-score.

---

## 9. API endpoints (new + changed)

| Method | Path | Purpose | Real? |
|---|---|---|---|
| POST | /api/agent/create | Ships a freeform agent | real |
| PUT | /api/agent/:id/config | Re-forge | real |
| POST | /api/knowledge/upload/:agentId | Chunk + embed + upsert to Qdrant | new, real |
| GET | /api/knowledge/:agentId | List ingested docs/chunks | new |
| DELETE | /api/knowledge/:agentId/:docId | Remove doc + delete vectors | new |
| POST | /api/agent/chat | Full RAG + tool-loop orchestration | real, upgraded |
| POST/GET/DELETE | /api/tools/:agentId[/:toolId] | Tool definition registry | new |
| POST | /api/crew/create | Define sub-agents + orchestrator | new |
| POST | /api/crew/:crewId/chat | Route a message through the crew | new |
| POST | /api/redteam/attack/:agentId | Redcap MODE:ATTACK only, real (§26 split) | new, real |
| POST | /api/redteam/judge | One prompt to real chat to real judge to one stored row (§26 split) | new, real |
| GET | /api/redteam/:agentId/history | Past red-team runs, by version | new |
| POST | /api/mentor/chat | Nova chat, now RAG-grounded | real, upgraded |
| POST | /api/mentor/ingest-docs | Internal: seed forgeflow_docs collection | new, internal |
| GET | /api/agents/:userId | List user's agents | unchanged |
| GET | /api/agents/:userId/:agentId | Single agent | unchanged |
| GET/POST | /api/progress/:userId | XP/rank state, freeform build resume (§23) | unchanged endpoint, extended use |
| GET | /api/leaderboard | Top 50 by XP | unchanged |

---

## 10. Data storage — where everything lives

```sql
CREATE TABLE knowledge_docs (id TEXT PRIMARY KEY, agent_id TEXT, source_name TEXT, chunk_count INTEGER, uploaded_at TEXT DEFAULT (datetime('now')));
CREATE TABLE tool_defs (id TEXT PRIMARY KEY, agent_id TEXT, tool_name TEXT, description TEXT, params_schema TEXT, endpoint_url TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE crews (id TEXT PRIMARY KEY, owner_user_id TEXT, orchestrator_agent_id TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE crew_members (crew_id TEXT, forged_agent_id TEXT, role_label TEXT);
CREATE TABLE redteam_runs (id TEXT PRIMARY KEY, agent_id TEXT, agent_version INTEGER, category TEXT, prompt TEXT, response TEXT, verdict TEXT, reason TEXT, suggestion TEXT, run_at TEXT DEFAULT (datetime('now')));
```

users/achievements unchanged. forged_agents gained one nullable column (§33, row 10): `template_id TEXT` — which `?template=<id>` a freeform build started from (null for "Start from scratch" and every agent shipped before this column existed). Qdrant: one collection per agent (agent_<forged_agent_id>), plus forgeflow_docs for Nova. Lyzr: the actual runtime, model inference, sessions, message history.

Real id relationships worth being precise about (confirmed in code, not assumed — knowledge_docs.agent_id and tool_defs.agent_id are the real Lyzr agent_id; crew_members.forged_agent_id, crews.orchestrator_agent_id, and redteam_runs.agent_id are all the internal forged_agents.id, deliberately stable across re-forge so crew membership and red-team history survive a re-forge's new Lyzr id).

---

## 11. How retrieval actually happens (query time, not creation time)

query -> Google gemini-embedding-001 (768 dims) -> Qdrant.search(collection=agent_<id>, top_k) -> chunks -> injected into that turn's message only. Originally spec'd text-embedding-004; retired on current Gemini API, so gemini-embedding-001 is what's actually in use.

---

## 12. Environment variables

```
QDRANT_URL=              # set
QDRANT_API_KEY=          # set
EMBEDDING_PROVIDER=google
EMBEDDING_API_KEY=       # set
LYZR_REDCAP_AGENT_ID=    # set -- real Redcap agent (Phase 4)

# backend (§36) -- real Supabase project, identity only, no app data stored there
SUPABASE_URL=            # set
SUPABASE_SECRET_KEY=     # set -- backend-only, Supabase's current name for the service_role key, never exposed to the client

# frontend (§36), both public by design (RLS-scoped / anon-equivalent privilege)
NEXT_PUBLIC_SUPABASE_URL=              # set
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # set -- Supabase's current name for the anon key
```

Security note: Qdrant/Google keys were shared in plaintext chat during setup, flagged for rotation once current UI work is stable.

## 13. Dependencies

```
@qdrant/js-client-rest    # installed
@google/generative-ai     # installed
```

---

## 14. Build order (dependency-ordered, matches Build Status table above)

1-2i. Done, see §15/§17-§24/§26 for each phase's results.
2j. Done, "Tool-Using Agent"/"Multi-Agent Crew" locked-card fix, §30.
3. Done, Tool execution loop, §18.
4. Done, Red Team Arena to Redcap, §25.
5. Done, Multi-agent crews, own Build Type, own 4-level flow, §27.
5b. Done, MCP Tool Agent resolved as a template, not a Build Type, see §3b.
6. Done, Nova platform-wide RAG, §28.
7. Done, Forge Score fix, §29.
7b. Done, backend-side tool-config validation at every real write path (/create, re-forge, and post-ship registration), §31/§35.
8. Deprioritized, not scheduled, per explicit call.
9. Deprioritized, not scheduled, per explicit call.

---

## 15. Phase 1 results

New: services/embeddings.ts (gemini-embedding-001, 768 dims), chunking.ts, qdrant.ts (with a docId payload index required by this cluster's strict mode), routes/knowledge.ts. Modified: schema, /chat now embeds+searches+prepends. Deleted old create-time injector.

Smoke test: invented-facts doc uploaded, real retrieval hit, correct answer. Negative control (no docs) hallucinated. Doc deleted, agent correctly said no info.

---

## 16. Data layer — SQLite vs. Supabase decision

Stay on SQLite through the build phases, revisit before public deployment, SQLite's real limitation is deployment (ephemeral filesystems), not scale. Revisit trigger: deployment target decided, not a single persistent VM.

---

## 17. Phase 2 results

New: lib/types.ts, lib/agentTemplates.ts, lib/codegen.ts (mirrors real payload exactly), CodePanel.tsx, FreeformBuildScreen.tsx, /build/new. Modified: campaignId fallback to "custom". Legacy route untouched.

Verified: freeform agent shipped as real Lyzr agent; knowledge attached post-ship with invented facts, real retrieval confirmed; deleted doc, grounding tied to live state; legacy flow + ?template= prefill both still work.

---

## 18. Phase 3 results

New: services/tools.ts (real HTTP execution), routes/tools.ts, tool_handler.py generation. Modified: /create bakes contract, /chat runs real ReAct loop (cap 4), re-forge propagates contract.

Deviation: tool registered post-ship isn't callable, Lyzr agents aren't patchable, attach is build-time only.

Verified: weather-tool agent's real TOOL_CALL matched a direct open-meteo call exactly. Negative control correctly refused.

---

## 19. Phase 2b results

New: lib/freeformMissions.ts, lib/freeformBlueprint.ts. Adapted (backward-compatible): MissionIntro.tsx/MissionRail.tsx generalized to primitives; LiveBlueprint etc. reused as-is.

Verified: overview matched editor sub-steps exactly; console blocked/unblocked Continue live; diagram nodes conditional on real opt-in; XP shown = XP awarded; Ship produced real agent_id; legacy flow unaffected.

---

## 20. Phase 2c/2d results

2c: new lib/freeformLint.ts (single validation source, real constraints), lib/freeformCode.ts. Rewritten CodePanel.tsx/FreeformBuildScreen.tsx, separate form fields removed, real inline slots only.

Verified: real lint messages block/unblock correctly; badges track real validity; 3 columns render with 0px overflow; §5b intact.

2d: MissionRail.tsx gained sticky? prop; whole left column pins as one unit (root cause of clipping). Template values populate a hints map for placeholder text only; draft starts blank.

Verified in Chrome: no clipping incl. after scroll; templates confirmed fully blank with correct hints. Firefox blocked by sandbox network limitation (not a known defect).

---

## 21. Phase 2e results — Levels to Missions to Subtasks

Reused MissionIntro.tsx as the Level-intro screen too (gained one rewardLabel prop). MissionRail.tsx gained disabledIndices?. lib/freeformMissions.ts restructured: MissionKey expanded to 8 real missions, added FreeformLevel/LEVELS/activeLevels()/levelForMission(). FreeformBuildScreen.tsx gained a third nav view (level/overview/editor); Upload mission hard-gated on !!created (real agent_id constraint, not UI-only).

Verified: Level 1 intro precedes Identity with correct XP; Levels 2/3 conditional on opt-in; Level 4's Upload genuinely locked pre-ship, unlocks immediately post-ship; real Upload flow end to end; XP-shown = XP-awarded (65/75 XP, Recruit to Engineer); minimum path (2 levels) and maximum path (4 levels, 8 missions) both verified.

Follow-up fix: the "opt-in" for Levels 2/3 was previously always manual (wantsKnowledge/wantsTools both defaulted false, or in wantsTools's case, true only if a template pre-populated real tool_defs — which no template ever does, per §2d) regardless of which template a build started from. lib/agentTemplates.ts gained TEMPLATE_LEVEL_DEFAULTS, a structural (not field-value) default: Retriever now opts Level 2/Memory in automatically, Tool-Using Agent opts Level 3/Tools in automatically; a blank build or a Crew sub-agent build (no templateId) is unaffected. §2d's placeholder-hint rule for field values is untouched — only whether the Level/mission is visible and reachable changes; the developer still types every real value themselves. The sidebar "Add optional missions" box became bidirectional (components/screens/FreeformBuildScreen.tsx) so a template-implied Level can be removed again before it's started (− Remove Memory / − Remove Tools), same as it could always be added.

Verified: Retriever template shows Level 2 (Memory) present with no click needed, sidebar shows "− Remove Memory"; top_k field still empty with placeholder="4", console shows blocking until filled — §2d intact. Same result for Tool-Using Agent and Level 3. Blank "Start from scratch" unaffected — neither section appears, "+ Add" buttons present. Opt-out via "− Remove Memory" verified working, restores "+ Add" state. Zero console errors.

---

## 22. Phase 2f results — post-ship hub restored for freeform agents

Root cause found: AgentChatScreen/ArenaScreen/CompareScreen/CertificateScreen all did getCampaign(agent.campaignId) and broke silently (null or infinite loader) for freeform's campaignId: "custom", all four were genuinely broken for every freeform-shipped agent before this pass.

Fix: new lib/freeformAgentView.ts, freeformShippedConfig(agent) reads real values straight from agent.lyzrPayload (freeform's agent.config is always {}). FREEFORM_ARENA_ATTACKS, 5 generic real-prompt attacks for agents with no campaign to draw from. All four screens now branch campaign ? ... : freeform... at every touchpoint.

FreeformBuildScreen.tsx's ShipPhase: real stats row (forgeTime/xpEarned/completed.size) + real 2x2 link grid to /agent/:id/{chat,arena,compare,certificate}, using the internal row id. No fabricated backlog panel reintroduced.

Verified: shipped "Hub Bot," confirmed real stats, clicked through all 4, real chat, real 5-attack arena run, real compare fork with real cost/latency, real non-blank certificate canvas.

Flagged, not fixed (out of scope at the time): AgentDocScreen had the identical bug, later fixed in §23.

---

## 23. Phase 2g results — persistent agent cards + freeform build resume

Resume/autosave: zero backend/schema changes, reuses users.active_campaign_id/build_slot_values and /api/progress/:userId, freeform claims activeCampaignId: "freeform" as its marker, stuffs whole state as one JSON blob under __freeform. Debounced (900ms) autosave on every field edit + navigation checkpoints, reading from a liveStateRef to avoid stale closures. A createdRef guard cancels in-flight autosave the instant Ship succeeds, avoiding a real race where a stale-closure autosave could have un-cleared the server-side progress wipe.

Card grid: new FreeformAgentCard, mirrors TiltCard's shipped state visually, reads real values via freeformShippedConfig().

AgentDocScreen.tsx fixed: new FreeformDocView, real sections only (hero stats, raw payload, test console, knowledge panel, cost table), no fabricated tutorial/glossary content.

Verified: filled Identity partially, left, returned, resumed correctly with a real toast, values intact; shipped for real, confirmed next build starts fresh; card grid + all 5 actions confirmed working from a real card.

---

## 24. Phase 2h results — /campaigns split into "Start a Build" / "Your Agents"

Pure layout/grouping change, zero functional changes. "Your Agents" omitted entirely (not an empty header) for a zero-agent user.

Verified: zero-agent state correct; both sections present and correctly ordered once an agent ships; structural DOM check confirmed zero cross-leakage between grids; existing card actions unregressed.

---

## 25. Phase 4 results — Red Team Arena to Redcap, dynamic and judged

Replaced the client-side static-array + keyword-substring flow with a real server-side attack-generate to target-chat to judge cycle against Redcap.

services/lyzr.ts: chatWithRedcapAgent(), mirroring chatWithMentorAgent()'s exact shape.

routes/redteam.ts (new): POST /run/:agentId loads the target's real role+instructions from forged_agents.lyzr_payload, confirmed the right universal source for both campaign and freeform agents (every agent gets a real lyzr_payload regardless of campaign_id). Calls Redcap MODE:ATTACK, parses via a small extractJson() helper (Redcap occasionally wraps JSON in prose despite instructions). Each of the 5 prompts sent through the actual production chat path (withRetrievedContext/runToolLoop, exported from agent.ts rather than duplicated), so a red-teamed agent with knowledge/tools gets genuinely tested. Each pair judged via MODE:JUDGE. data_exfiltration gets a deterministic regex backstop, scoped to exactly that category. Results stored tagged with forged_agents.version read fresh at run time. GET /:agentId/history added.

ArenaScreen.tsx rewritten to call the real endpoint. Since the whole cycle was one synchronous backend round-trip at this point, the old live per-step progress animation wasn't possible the same way, replaced with a plain running-state message (restored in §26 via a two-endpoint split).

CompareScreen.tsx: the "Test this fix" handoff previously indexed into a static attack array, with Arena now generating different prompts every run, that index would have silently pointed at the wrong data. Fixed by passing the real prompt/category/suggestion inline via query params instead of an index.

Known, deliberate behavior change (fixed in §26): red-team-triggered chats no longer increment the scientist achievement counter, since they bypass /api/agent/chat.

Verified (real Lyzr, real Redcap, no mocks):
1. Real freeform agent, full pass via direct API, 69s wall time, 11 real sequential Lyzr calls. All 5 prompts genuinely tailored and materially different from the old static prompts. Agent held on all 5 with specific, non-generic reasons. One deviation found: Redcap sometimes labels the 5th category contradiction_pressure rather than the contradiction_trap name requested, harmless, decision recorded in §7.
2. A deliberately leak-prone second agent proved the regex backstop fires correctly for data_exfiltration AND stays correctly scoped, the identical literal leak in a jailbreak_roleplay response stayed held on Redcap's own judgment.
3. History correctly tagged agent_version: 1.
4. Real re-forge (version 1 to 2, confirmed via DB) + second run, history split cleanly 5-and-5 by version, the real before/after the spec calls for.
5. Full Playwright UI pass: real running-state copy, real progress dots, real held/broke summary, real bug report with specific reason + suggestion, "Test this fix" correctly pre-filled Compare with real data. Zero console errors.

Test agents and redteam_runs rows cleaned up (including a second Lyzr agent id from the re-forge, since Lyzr agents aren't patchable in place).

---

## 26. Phase 2i results — Red Team Arena live progress + achievement counter

Two follow-up fixes to §25's real gaps.

FIX 1 (achievement counter): POST /judge (below) now runs the same chat_queries_run increment + awardAchievement("scientist") check /api/agent/chat does, but placed right after the real target chat resolves, before Redcap's judge call, not after. Verified this placement matters: an early test run hit a genuine Redcap JSON-parse miss on one judge call ("no JSON found in Redcap response", a real occasional LLM-output issue, not a bug), and the counter came back 4/5 instead of 5/5, the chat had genuinely happened but the exception threw before reaching an increment placed after judging. Moved the increment earlier; a follow-up direct call confirmed the counter now advances even independent of judge success.

FIX 2 (live progress): POST /api/redteam/run/:agentId split into two: POST /attack/:agentId (Redcap MODE:ATTACK only, fast) and POST /judge (one prompt to real target chat to real Redcap MODE:JUDGE, including the data_exfiltration regex backstop, to one stored redteam_runs row). Same storage/version-tagging as §25, unchanged, request-shape change only. ArenaScreen.tsx now calls /attack once, then loops /judge sequentially per prompt, pushing each real result into state as it lands, attacker bubble shows immediately with a typing indicator while its judge call is in flight, then fills in with the real response + held/broke badge. Progress dots read real per-index state (pending/active/held/broke) instead of an all-or-nothing running flag. A per-item try/catch (restored from the original pre-Redcap Arena) means one judge call failing renders an isolated error card and the run continues, genuinely exercised by the same JSON-parse miss above, which did not take down the other 4 results. CompareScreen.tsx's "Test this fix" handoff was already query-param-based (§25), not tied to the old endpoint's response shape, so it needed no change, confirmed working against the new flow.

Verified (real Lyzr, real Redcap):
1. Polled live DOM state through two full real runs against a freshly-shipped freeform agent. Held/broke counts advanced one at a time, attacker bubbles appeared progressively with a live typing indicator on the in-flight one, not all 5 at once, screenshotted at each step.
2. Total wall time (~70s for 5 sequential judge calls + 1 attack-gen call) matches §25's original single-endpoint timing, confirming sequential (not parallelized) real calls.
3. chat_queries_run confirmed incrementing by exactly 1 per real judge call across both a run containing a genuine error (4/5 counted, matching the 4 real chats that completed before their exceptions) and a fully clean run (+5), before-fix behavior reproduced and fixed, not assumed.
4. "Test this fix in Compare" from a real broke result opened Compare with the real prompt/category/suggestion pre-filled and the securityMode banner showing.

Zero console errors on the clean run; the one error seen was the genuine, correctly-handled Redcap parse miss described above, not an app defect. Test agent and its redteam_runs rows cleaned up afterward.

---

## 27. Phase 5 results — Multi-Agent Crew, own Build Type, own 4-level flow

Backend. crews/crew_members added to schema.sql (plain new CREATE TABLE IF NOT EXISTS, no migration guard needed, same as every prior new table). New services/crew.ts: buildRouteContract(roleLabels) (mirrors tools.ts's buildToolContract exactly, real contract text baked into agent_instructions), parseRouteCall(response) (mirrors parseToolCall in spirit, tolerates leading prose, but ROUTE_TO's payload is a plain role label, not JSON, so it just takes the rest of the marker's line). /api/agent/create now accepts an optional crewRoles: string[] and appends the real route contract the same way it already appends the tool contract, a single agent is never sent both. New routes/crew.ts: POST /create (persists the crew only after verifying every referenced forged_agents id is real and already exists, never creates a crew pointing at an agent that doesn't exist), GET /:crewId, POST /:crewId/chat (the real routing loop, orchestrator gets a real chat call through the same withRetrievedContext/runToolLoop pipeline /api/agent/chat uses; if its real response carries ROUTE_TO: <role>, the matching sub-agent gets its own real chat call and that response is what's returned, not an orchestrator-recomposed one; each real agent gets its own derived, stable session id). Same chat_queries_run/"scientist" bookkeeping as /api/agent/chat and the Phase 4 follow-up.

Frontend, reused, not rebuilt, per instruction. CrewBuildScreen.tsx (new) owns only the crew-level scaffolding: it reuses MissionIntro.tsx directly (zero changes) for both the Level-intro and mission-overview screens across all 4 levels, and MissionRail.tsx directly for the Build Map. Every actual sub-agent and the orchestrator are built by mounting FreeformBuildScreen itself, unmodified in its core logic, the entire real single-agent flow (Identity/Instructions/Model & Tuning, optional Knowledge/Tools, real Ship) runs once per sub-agent. FreeformBuildScreen gained five small optional props, all no-ops for its existing standalone /build/new callers: onShipped (fires the instant a real agent_id exists), crewNext (swaps "+ Ship another agent" for a crew-aware continue action on both the Ship hub and post-Upload), initialRoleHint (pre-seeds the Identity role field as a placeholder hint, never a filled default, same §2d rule templates already follow), crewRoles (passed straight through to createAgent() for the orchestrator build), extraCodeFiles (new CodePanel.tsx prop, additional real read-only tabs). Crew sub-builds are also excluded from the single-slot freeform resume/autosave mechanism (§2g), since they're embedded, not a standalone build. New lib/crewCode.ts generates real crew_config.py/orchestrator.py, the latter mirrors tool_handler.py's parse-execute-respond shape exactly, just ROUTE_TO instead of TOOL_CALL and "call a real sub-agent's chat endpoint" instead of "run a real webhook", shown as extra CodePanel tabs only on the Orchestrator mission. CrewChatScreen.tsx (new, at /crew/:crewId/chat), adapted from AgentChatScreen's markup/CSS classes rather than reused directly, since a crew has no single ApiForgedAgent/campaignId for that component's data model to fit; every message goes through POST /api/crew/:id/chat, and each response shows the real routedTo role inline. CampaignMapScreen.tsx's formerly-locked "Multi-Agent Crew soon" card is replaced with a real CrewCard routing to /build/crew.

Verified (real Lyzr, no mocks, full Playwright pass):
1. Built a real 2-sub-agent crew end to end through all 4 levels from the new entry point: Define the Crew (role labels "Billing Specialist"/"Technical Specialist") to Build Each Sub-Agent (two full real single-agent builds, each shipped independently with distinct real Lyzr agent_ids, confirmed via the crew-aware "Continue to X" button replacing "Ship another agent") to Orchestrator (confirmed its CodePanel showed real crew_config.py/orchestrator.py tabs containing the actual role labels and the real ROUTE_TO contract text, shipped as its own real agent) to Deploy Crew (confirmed the preview showed every real shipped agent_id, deployed for real, got back a real crew_id). Zero console errors throughout.
2. Queried crews/crew_members directly, correct real orchestrator_agent_id and two crew_members rows with real forged_agent_ids and the exact role labels.
3. Real chat routing, verified three ways: a billing-flavored message, orchestrator's real response carried ROUTE_TO: Billing Specialist, backend called the Billing sub-agent's real chat endpoint (confirmed via its distinctly billing-flavored real answer, not a generic one), routedTo: "Billing Specialist". A technical-flavored message, routed differently, to the Technical sub-agent, with a distinctly technical real answer. A generic greeting, orchestrator answered directly, routedTo: null, proving the non-routed path is real too, not just the routed one.
4. Same three scenarios re-confirmed through the actual CrewChatScreen UI at /crew/:crewId/chat, real "routed to Billing Specialist" / "routed to Technical Specialist" labels rendered inline per message, real composition sidebar showing real agent ids.
5. Confirmed without any additional code that all 3 crew-shipped agents (2 sub-agents + orchestrator) appeared correctly in the existing "Your Agents" grid (§2g/§2h) as ordinary FreeformAgentCards with their full real action sets, spot-checked one card's own individual "Talk to Agent" action still worked correctly, independent of the crew chat route.

Test agents (3 real Lyzr agents) and the crew's crews/crew_members/forged_agents rows all deleted from Lyzr/SQLite afterward.

---

## 28. Phase 6 results — Nova platform-wide RAG

Reused Phase 1's real RAG pipeline (chunking.ts/embeddings.ts/qdrant.ts) against a new fixed-name collection instead of building a second retrieval implementation.

services/qdrant.ts: the real body of ensureCollection/upsertChunks/search was extracted into private *Named(name, ...) helpers taking an already-resolved collection name; the existing agent-keyed exports are now thin wrappers calling collectionName(agentId) first, same real behavior, zero change for any existing caller. New public ensureForgeflowDocsCollection/upsertForgeflowDocsChunks/searchForgeflowDocs/deleteForgeflowDocsCollection call the same helpers against a fixed forgeflow_docs name (overridable via NOVA_DOCS_COLLECTION_OVERRIDE for testing, never used in normal operation).

data/forgeflowDocsContent.ts (new): the actual documentation content, written from what's really implemented this session, not guessed, covers query-time Knowledge/RAG retrieval and why Upload Your Knowledge is gated on a real post-ship agent_id, the TOOL_CALL loop and its build-time-only attachment constraint, Red Team Arena's ATTACK/JUDGE modes and per-version history, why Levels/Missions/Subtasks are structured as progressive disclosure, how Crew's ROUTE_TO routing works, the five real pillars, and a glossary of real terms (forge score's actual weighted formula including the honest tool-bucket caveat, agent_id vs internal row id, top_k, version, etc.).

routes/mentor.ts: new POST /ingest-docs (internal/admin, §9), chunks the content, embeds it, deletes-and-recreates the collection first so re-running after an edit doesn't leave stale duplicate chunks, upserts. POST /chat now runs the message through withForgeflowDocsContext() (embed the live question, search forgeflow_docs, prepend real chunks, exact same per-query pattern as agent.ts's withRetrievedContext, not baked in once) before it ever reaches Redcap's sibling agent, Nova. A second, additive grounding layer, withAgentContext(), activates only when the request carries a real agentId: it loads that forged_agents row and injects its real role/model/temperature/instructions/forge_score on top of the doc grounding, the two layers stack, they don't replace each other.

Frontend contextual wiring: store.ts gained activeAgentId (mirrors the existing activeContext exactly). AgentDocScreen.tsx sets both on mount for whichever agent's Doc page is open, covers the campaign-agent and FreeformDocView render paths with one effect, since agent is fetched once above both. MentorPanel.tsx passes activeAgentId through to chatWithMentor() under the same mentorKey === "build" gate activeContext already uses (which already covers /agent/:id/doc, since resolveMentor() falls through to that key for any non-campaign-screen route, no routing logic needed changing).

Verified (real Lyzr, real Qdrant, real Gemini embeddings, no mocks):
1. Seeded for real: 16,096 real characters into 10 real embedded chunks in the real forgeflow_docs collection.
2. Asked "why does Upload Your Knowledge only unlock after I ship?", first pass came back correctly-mechanismed but hedgy (the seed content didn't yet state that connection as one explicit fact), added one explicit paragraph tying the lock to the real agent_<id>-keyed Qdrant collection not existing pre-ship, re-ingested, re-asked, Nova then answered confidently and specifically with the real mechanism, not generic guessing.
3. Negative control, same pattern as §1/§15: deleted the real forgeflow_docs collection directly via the Qdrant client, asked the identical question, Nova's answer degraded to generic, incorrect guessing (invented a fictitious "Knowledge Base... selected in core features" explanation, nothing about the real agent_id-keyed collection). Re-ran /ingest-docs to restore the real collection, re-asked, got the correct specific answer back, proving the grounding is real and doc-gated, not something Nova would say anyway from general training.
4. Shipped a real test agent (temperature 0.9, real computed forge score 91/100), asked "why is my forge score what it is, what's the actual number" with its real agentId, Nova's answer opened with "Your forge score is 91/100" (the exact real value) and correctly reasoned about temperature-vs-0.3 and the tool-bucket caveat pulled from the real scoring docs, both grounding layers working together, not just one.
5. Asked "what is a forge score?" with no agentId, got a correct general platform-grounded answer with no fabricated agent-specific number, confirming the ungrounded-for-that-agent fallback behaves correctly rather than inventing one.
6. Full Playwright pass through the real UI: opened a real agent's Doc page, opened Nova, asked the same forge-score question through the actual chat input, the real rendered answer explicitly referenced "a stored context value saying 91/100", confirming the entire frontend-to-backend wiring (not just the API in isolation). Zero console errors. Screenshotted.

One real, out-of-scope observation made while verifying step 6 and recorded above rather than silently fixed: MentorPanel's header "Context · ..." label always renders the static per-screen mentor.ctx default, not the dynamic context string actually sent to the backend, a pre-existing display quirk, not something this phase introduced or was asked to fix.

Test agent and its Lyzr agent deleted afterward; the real seeded forgeflow_docs collection was intentionally left in place as permanent platform data, not test data.

---

## 29. Phase 7 results — Forge Score's tool-config component made real

Confirmed the bug directly in code first: services/forgeScoring.ts line 35 was a bare score += 15; with a comment admitting it was "not applicable per-campaign yet (auto-granted)" — every agent got full tool-config credit whether or not it had any tools, and whether or not those tools were well-formed.

services/forgeScoring.ts: added ToolScoreInput (toolName/description/endpointUrl) and two new optional ForgeScoreInput fields, tools and instructionsWithToolContract (the literal instructions string actually sent to Lyzr this call, contract included). New scoreToolConfig() replaces the flat grant: zero tools attached scores 0 for this bucket (there's nothing to be complete about); each attached tool is checked on 4 real, independently-verifiable facts — a valid snake_case name, a real non-trivial description (≥8 chars), a genuinely valid endpoint (the builtin:weather sentinel or a well-formed http(s):// URL via new URL()), and proof the TOOL_CALL contract line for that exact tool name (- ${toolName}:) actually appears in the instructions string sent this call — the real, per-call check for §18's build-time-only attachment constraint, not just a tool_defs row existing in the DB. Per-tool fraction (checks passed / 4) is averaged across all tools and scaled to the existing 15-point bucket. Every other scoring component (instruction length, temperature proximity, model selection, top_k sweet spot, speed bonus) is byte-for-byte unchanged.

routes/agent.ts (POST /create): now passes the real toolDefs array (already normalized and already used to bake the contract into instructionsWithTools a few lines above) and that exact instructionsWithTools string into calcForgeScore.

routes/agents.ts (PUT /:userId/:agentId/config, re-forge): now reads the agent's live tool_defs via getToolRows/rowsToInputs (imported from routes/tools.ts) before scoring — this naturally picks up any tool registered post-ship via POST /api/tools/:agentId since the last forge, not just tools attached at original creation — and passes both the real tool list and the freshly-built instructions + toolContract string used for the new Lyzr agent.

No crew-specific or template-specific code was touched: Multi-Agent Crew sub-agents and template-shipped agents both already funnel through the identical POST /api/agent/create route (crew via the embedded FreeformBuildScreen's createAgent() call, templates via ShipScreen.tsx's createAgent() call), so the fix applies to both automatically. ShipScreen.tsx's createAgent() call never sends a tools field at all, so template-shipped agents hit the same toolDefs = [] path as any tool-less freeform agent.

Verified with real data (curl + a real Playwright crew build, no mocks):
1. No-tools baseline — shipped a real agent (89–141-char instructions, temp 0.3, no tools): forge_score 85/100 (20 instruction + 15 temp + 15 model + 20 top_k-N/A + 0 tools + 15 speed). Confirms the bucket is genuinely 0, not the old flat 15 that would have made this 100.
2. Well-configured tool — same agent shape plus one real tool (get_weather, real description, builtin:weather endpoint): forge_score 100/100 (85 + full 15). lyzr_payload.agent_instructions genuinely contains the baked - get_weather: contract line, confirmed by direct read.
3. Deliberately invalid tool — the frontend's ToolsEditor itself enforces http://https:// for webhook mode and has no way to submit a malformed endpoint, so to construct a genuinely broken config we called the same POST /api/agent/create endpoint the UI uses directly, with an empty description and endpoint "not-a-real-url" — a gap the backend itself doesn't reject either (only checks non-empty, not well-formed). Result: forge_score 93/100 (85 + 8, i.e. 2 of 4 per-tool checks passed — valid name and baked contract — 2 failed — description and endpoint), real partial credit instead of the old flat pass. This is the exact class of bug the flat grant used to hide — logged as row 7b, open.
4. Re-forge recalculation — registered a new, real, well-configured tool (lookup_order_status, real webhook https://example.com/api/order-status) onto the already-shipped no-tools-baseline agent via the real post-ship POST /api/tools/:agentId endpoint, then re-forged it via PUT /api/agents/:userId/:agentId/config. Score recalculated from 85 → 100 on the same call, version incremented 1 → 2, and the new agent's lyzr_payload.agent_instructions genuinely contained the newly-baked contract line — confirms "recomputed on every re-forge" is still true and correctly reflects a tool the agent didn't have at original creation.
5. Crew sub-agent — real Playwright run through the actual Multi-Agent Crew build flow (/campaigns → Build a Crew → Define the Crew → Build Each Sub-Agent), attached the real built-in weather preset to a sub-agent via the same ToolsEditor component freeform builds use, shipped for real (agent_id 6a6eb86f..., zero console errors). Confirmed via direct DB read: forge_score = 100, tool_defs genuinely persisted (GET /api/tools/:agentId returned the real row), and the contract line genuinely present in lyzr_payload.agent_instructions — proving the fix applies to crew sub-agents through the exact same code path as freeform/template ships, not something that needed separate implementation.

All five test agents (4 direct-API, 1 real Playwright-shipped crew sub-agent) deleted from both Lyzr (DELETE /v3/agents/:id, all returned 200) and local SQLite (forged_agents/tool_defs rows) after verification; the temporary cleanup script was removed afterward.

---

## 30. Phase results — "Tool-Using Agent" / "Multi-Agent Crew" locked-card fix (row 2j)

Investigated both cards before changing anything, per row 2j's "cause undetermined" framing.

Tool-Using Agent — confirmed a real, live bug, not stale cache: a fresh Playwright session against the actual running dev server showed the card genuinely rendered as LockedCard with a "soon" badge and "Unlocks after build 1". Root cause was two real pieces of leftover campaign-progression data/logic that predate Phase 3 making Tools genuinely real for any freeform build: lib/campaigns.ts's toolAgent.unlockAfter: "retriever", and CampaignMapScreen.tsx gating the card render on useGameStore((s) => s.unlockedCampaigns).includes("tool-agent") (default-unlocked set is just ["retriever"] for any new session). Neither prerequisite is real — Tools have had zero dependency on having shipped a Retriever agent first since §18.

Multi-Agent Crew — investigated, found already correctly unlocked in the current code and the live render. CrewCard() in CampaignMapScreen.tsx has never had a lock condition — it's rendered unconditionally, routes straight to /build/crew, exactly matching §27's summary of what was shipped. A fresh Playwright pass against the live app confirmed no "soon" text and no lock styling anywhere near it. No code change was needed or made for this card; the report describing it as locked was most likely a stale screenshot or browser cache from before Phase 5 shipped, not a regression in the running app.

Fix (Tool-Using Agent only):
- lib/campaigns.ts: toolAgent.unlockAfter changed from "retriever" to null, matching Retriever's own unlockAfter: null — there is no real prerequisite.
- components/screens/CampaignMapScreen.tsx: removed the toolAgentUnlocked conditional and the now-fully-unused LockedCard component entirely (it had no other caller); the Tool-Using Agent card now always renders as the same real TiltCard the Retriever card uses, routing to /build/new?template=tool-agent unconditionally, identical to Retriever's own unshipped-state click behavior.
- The generic unlockedCampaigns/unlockCampaigns store mechanism (store.ts, ShipScreen.tsx, ProgressSync.tsx) was left in place since it's harmless generic session state with no other live gate depending on it after this fix — not fake or hardcoded, just currently inert since no campaign sets a non-null unlockAfter anymore.

Verified with real Playwright runs against the live dev server, no mocks:
1. Fresh session, /campaigns: Tool-Using Agent card renders with no "soon" badge and no "Unlocks after build" text, tags (MCP, Tool calling, Lyzr run) no longer greyed out — screenshotted before and after.
2. Clicking the Tool-Using Agent card navigates to http://localhost:3000/build/new?template=tool-agent and lands on the real freeform builder's Level 1 "Root Agent" intro — same real flow Retriever already used, not a new one.
3. Advancing into the Identity mission: the name field's placeholder reads the real template hint "Task Automation Agent" while the actual input value is empty (confirms Phase 2d's "placeholder hint, not filled default" behavior still holds for this template) — instructions/role/goal are the real tool-oriented template copy (lib/agentTemplates.ts's tool-agent preset), not fabricated for this fix. The template intentionally does not pre-attach a fake tool_defs row, since a real tool needs a real endpoint only the developer can supply — the "hint" is the identity/instructions content, same pattern Retriever uses for its topK default rather than fake documents.
4. Clicking Build a Crew navigates to http://localhost:3000/build/crew and lands on the real "Define the Crew" Level 1 screen — unchanged, confirming it was never broken.
5. Zero console errors across all passes.

Re-confirmed with a stricter, cache-ruled-out pass (re-requested after the above, to eliminate any doubt that the first pass could have been masked by a stale build or client-side-only re-render): checked .next build artifact mtimes against the edited source files directly (build manifests were newer than the edits, i.e. the dev server had genuinely rebuilt, not serving a stale bundle); then ran a brand-new Playwright browser context (no prior storage/cache) doing a hard page.goto with a cache-busting query string and waitUntil: "networkidle", and inspected the raw server-rendered page.content() HTML directly rather than the post-hydration DOM. Result: html.includes("ccard locked") is false anywhere on the page, Tool-Using Agent/Build a Crew both have no badge-soon within 200 characters, and "Unlocks after build" does not appear in the rendered body at all. Cold clicks on both cards from this same fresh context still routed correctly (/build/new?template=tool-agent, /build/crew). This confirms the fix is real at the server-render level, not something that only looked fixed due to client-side navigation state.

---

## 31. Phase 7b results — real backend-side tool-config validation

**services/tools.ts**: added `MIN_TOOL_DESCRIPTION_LENGTH` (8, matching §29's scoring threshold), `isValidToolName`, `isValidToolDescription`, `isValidToolEndpoint` (builtin sentinel or well-formed `http(s)://` via `new URL()`), and `validateToolDef(t)` returning one error message per failed check. **forgeScoring.ts** now imports these instead of its own copy of the endpoint-URL check it previously defined inline — one real definition of "valid," shared by scoring and validation, not two.

**routes/agent.ts** (`POST /create`): `normalizeIncomingTools` (silently dropped malformed entries) split into `parseIncomingTools` (parse only) + `validateTools` (runs `validateToolDef` per tool). If any tool fails, the route returns `400 { error: "Invalid tool configuration", toolErrors: [{ toolName, errors[] }] }` before ever calling Lyzr — matching this route's own existing "Missing required fields" 400 pattern rather than inventing a new one, and rather than the old silent-drop behavior (which the code's own comment had explicitly chosen, now superseded: a bad tool blocking the ship is more honest than one silently vanishing).

**routes/agents.ts** (`PUT /:userId/:agentId/config`, re-forge): validates the agent's *live* `tool_defs` (the same rows §29's fix already reads via `getToolRows`/`rowsToInputs`) before building the new instructions/calling Lyzr. This is the real enforcement point for a tool that reached `tool_defs` through the weaker `POST /api/tools/:agentId` post-ship registration path (which still only checks non-empty fields, unchanged — out of this task's stated scope) — re-forge is what actually bakes a tool's contract into a fresh agent, so it's where an invalid one must be caught.

**Frontend finding, fixed as a necessary consequence of real verification:** `FreeformBuildScreen.tsx`'s `ToolsEditor.addTool()` validated tool name and (for webhook mode) URL format, but never validated description — switching to "Custom webhook" mode clears the description field to `""`, and a developer could attach a tool with a blank description without the frontend objecting. This meant the premise "the frontend already only submits valid configs" wasn't quite true, and the new backend gate would have silently started rejecting a real, previously-working (if low-quality) submission path with a raw API error instead of an inline one. Added the same `description.trim().length < 8` check to `addTool()`, with an inline form error matching the existing style — closes the loop so frontend and backend agree on "valid," and the backend validation is a true no-op safety net for the real UI flow, not a hidden new wall.

**Verified with real requests, no mocks:**
1. §29's exact invalid case (`do_thing`, empty description, endpoint `"not-a-real-url"`) POSTed directly to `/api/agent/create`: **400**, `{"error":"Invalid tool configuration","toolErrors":[{"toolName":"do_thing","errors":["description must be a real, non-trivial description (at least 8 characters)","endpointUrl must be \"builtin:weather\" or a well-formed http:// or https:// URL"]}]}` — rejected outright, no Lyzr agent created, instead of shipping with a 93/100 score.
2. Same request shape with a real tool (`get_weather`, real description, `builtin:weather`): **200**, ships normally, `forgeScore: 100` — unaffected, confirming §29's scoring behavior for valid configs is untouched (point 3 of the task).
3. Re-forge path: created a no-tools baseline agent, registered an invalid tool (`sneaky_tool`, empty description, `"not-a-real-url"`) directly via the real `POST /api/tools/:agentId` (still **200** there, unchanged, out of scope), then called `PUT /api/agents/:userId/:agentId/config` — **400**, same `toolErrors` shape, re-forge correctly refused to bake a broken contract into a fresh agent. A control re-forge of the valid-tool agent from point 2 still succeeded normally (**200**, `forgeScore: 100`, version incremented), confirming re-forge isn't broken for the real case.
4. Real Playwright pass through the actual `ToolsEditor` UI: default weather-tool attach still works with zero form errors (regression-clean); switching to webhook mode, filling a valid name + URL, and leaving the description blank now gets blocked **inline** with "Description must be at least 8 characters..." before ever reaching the backend; filling a real description then attaches normally. Screenshotted, zero console errors.
5. Real Multi-Agent Crew build (same shape as §29's crew verification): shipped a sub-agent with the real built-in weather tool attached via the actual UI — **200**, real Lyzr `agent_id`, zero console errors — confirming the validation applies uniformly to Crew sub-agents through the same `POST /api/agent/create` route freeform and template ships use (§29 already established this is one shared entry point; not re-derived here, confirmed still true after this change).

All test agents (2 direct-API, 1 crew-shipped) deleted from both Lyzr and local SQLite after verification; the temporary cleanup script was removed afterward.

---

## 32. Phase results — four freeform/Crew builder fixes (layout, inline slots, resume)

**FIX 1 — Crew sub-agent header overlap.** Root cause: `FreeformBuildScreen` is a full page component (its own `mx-auto max-w-[1400px] px-6 py-10` wrapper, its own "← back to ForgeFlow" + "Freeform build" header) that `CrewBuildScreen` mounts *inside* its own already-headered layout for every sub-agent/orchestrator mission — the embedded instance's header rendered a second time, stacked on Crew's real one. The `crewMode` boolean (`!!(onShipped || crewNext)`) already existed as the exact right signal, just unused for this. Fix: `components/screens/FreeformBuildScreen.tsx` — the `backLink` used by the Level-intro/mission-overview views, and the main editor view's `subnav` header + its outer padding wrapper, all render `null`/plain when `crewMode` is true, deferring entirely to Crew's real header.

**FIX 2 — Tools mission (Define a Tool / Wire the Tool) converted to real inline slots.** The standalone `ToolsEditor` form (boxed `<input>`s above the code panel) is removed entirely. `tool_handler.py` is now an interactive file: `lib/freeformCode.ts`'s new `toolHandlerSegments()` renders every already-attached tool as a real, editable row (`{"name": ..., "description": ..., "endpoint": ...}` with a real "× remove"), plus one more set of slots for the tool currently being defined, ending in a real "+ attach tool" action — disabled until its fields pass the exact same checks `services/tools.ts`'s `validateToolDef` enforces server-side (§31): valid snake_case name, ≥8-char description, `builtin:weather` or a well-formed `http(s)://` URL (verified live via `new URL()`), plus a duplicate-name check against already-attached tools. `AgentDraft` gained `toolDraft*` scalar fields (name/description/endpoint/kind/params) for the in-progress tool — the developer's typing lives directly on the draft, not a second form's local state. The real TOOL_CALL loop code (`TOOL_CONTRACT`, `handle_chat_with_tools`) that used to be `tool_handler.py`'s entire (static) content is preserved verbatim below the editable section — §5b's "code panels must be real" rule still holds.

**FIX 3 — Define the Crew converted to real inline slots.** The role-label rows (boxed `<input>`s + "✕"/"+ specialist" buttons) are replaced with `lib/freeformCode.ts`'s new `crewDefineSegments()`, rendering a real, editable `CREW_MEMBERS = [{"role_label": ...}, ...]` inside a genuine crew_config.py-styled code panel — same real "× remove" / "+ specialist" actions, same slot styling. Neither FIX 2 nor FIX 3 invented a second input mechanism: `components/freeform/CodePanel.tsx`'s `InlineSlot`/`InlineAction` were generalized (an optional `value`/`onChange`/`state`/`locked` override on `CodeSlot`, replacing the previous always-`draft[field]` assumption) and exported, along with two new exported pieces — `SegmentsView` (the segment-rendering loop) and `CodeFrame` (the traffic-light-chrome + tab-strip wrapper) — pulled out of `CodePanel` itself so a screen with no `AgentDraft` at all (Crew's role-label list) reuses the identical real components, not a lookalike.

**FIX 4 — resume/autosave, re-verified and genuinely fixed across all three build paths.** §23's claim was re-checked independently with a *real* browser close/reopen (a Playwright `launchPersistentContext`, not the fresh throwaway context every prior verification in this session used) rather than trusted:
- **Freeform**: resume itself worked for an edit made ≥900ms before closing. But a quick close/refresh right after typing — realistic, common behavior — beat the debounced autosave and silently lost the edit; confirmed with a real timed test (filled a field, closed with zero wait, reopened: empty). Root cause: `saveProgress`'s 900ms `setTimeout` has no flush-on-unload path. Fixed: `lib/api.ts`'s `saveProgress` gained an optional `{ keepalive: true }` (a real `fetch(..., { keepalive: true })`, which the browser finishes sending even as the page unloads); `FreeformBuildScreen.tsx` now flushes the live draft immediately on `pagehide`/`beforeunload`. Re-verified: quick-close-and-reopen now resumes correctly; a plain F5-style `page.reload()` immediately after typing also now resumes correctly (the explicit "must persist the refresh" ask).
- **Crew**: had no resume mechanism at all before this pass. Added, reusing the identical `/api/progress` columns and the same debounce+pagehide-flush pattern, under `activeCampaignId: "crew"` (distinct from `"freeform"` so the two can never collide — only one guided build is ever in progress per user, matching the existing rule). Persists role labels, which sub-agents/orchestrator have really shipped (their real `ApiForgedAgent` objects, `lyzrAgentId` included), and the current level/mission position. A real gap was found and fixed during verification: resuming naively could land back on the exact sub-agent index that was *just* shipped right before closing — since that embedded `FreeformBuildScreen` instance always starts blank, this would have let the developer re-ship a genuine duplicate agent for the same role. Fixed by detecting this exact case on resume and skipping forward to the first real unshipped sub-agent (or straight to the Orchestrator level if all specialists are already shipped), correctly respecting whether that Level had already been started (so it lands on the mission-overview, not a redundant Level-intro).
- **Legacy `/build/[campaignId]`**: found to have two independent real bugs, not one. (a) The exact same quick-close race as freeform — fixed with the identical `pagehide`/`beforeunload` keepalive-flush pattern in `BuildScreen.tsx`. (b) A second, distinct, pre-existing bug unrelated to the race: the per-mission slot-rehydration effect (`useEffect` reading `useGameStore.getState().slotValues` to restore the code editor's fields) ran once on mount — before `ProgressSync`'s async `getProgress()` had populated the store — and never re-ran once hydration completed, since `progressLoaded` wasn't in its dependency array. Real consequence: even a save that completed successfully server-side (confirmed via direct SQLite read) rendered as a blank field on every resume, 100% of the time, regardless of timing. Fixed by adding `progressLoaded` to that effect's dependencies.

**Verified with real Playwright, no mocks (all three used a genuine `launchPersistentContext` close/reopen, not a fresh context):**
1. FIX 1: navigated Crew → sub-agent build, screenshotted — exactly one "← back to ForgeFlow", no duplicate "Freeform build" label, zero console errors.
2. FIX 2: attached the real weather-tool preset (real 2/2 checks passed), confirmed the duplicate-name check correctly re-blocks "+ attach tool" when the reset draft collides with an already-attached name (a genuine edge case, not scripted for — the mechanism just worked); no separate form visible anywhere.
3. FIX 3: filled both pre-existing role-label slots inline, confirmed "Continue →" gates on real validity, added/removed rows via the real inline actions, advanced into the real sub-agent build.
4. FIX 4 freeform: quick-close-then-reopen and immediate-refresh-then-check both now resume with the real typed value intact (previously both lost it).
5. FIX 4 Crew: shipped one real sub-agent (real Lyzr `agent_id`), closed the tab immediately, reopened — resumed with that agent's real id intact, correctly skipped to the next specialist's mission-overview (not re-shown "Define the Crew", not re-shown a blank duplicate build for the already-shipped role).
6. FIX 4 legacy: filled a real slot in Retriever's "Give the agent a mind" mission, closed immediately, reopened — the real typed value is present in the editor (confirmed both via the live DOM and via a direct SQLite read of `build_slot_values` proving the server-side save itself was correct all along, isolating the bug to the client-side read-back path).

All real Lyzr test agents (3 "Billing Bot Resume Test" sub-agents across the FIX 4 verification runs) deleted from Lyzr + local SQLite afterward; all throwaway test users' `users` rows removed; temporary cleanup script removed.

---

## 33. Phase results — "Your Agents" card grid: template provenance + real deletion (row 10)

**FIX 1 — real template provenance.** Root cause confirmed in code: `campaign_id` is always `"custom"` for a freeform-created agent, including one started via `?template=<id>` — templates only ever pre-fill `AgentDraft` client-side, nothing about which template was used was ever sent to the backend. `forged_agents` gained a nullable `template_id` column (migration-guarded, same `PRAGMA table_info` + `ALTER TABLE` pattern every prior new column uses). `FreeformBuildScreen.tsx` now sends its own `templateId` prop (already captured from `?template=` for the placeholder-hint mechanism, §2d) as part of the real `POST /api/agent/create` payload; `routes/agent.ts` persists it verbatim (normalized to `null` for anything not a real non-empty string) and returns it. `FreeformAgentCard`'s tag reads `getCampaign(agent.templateId)?.title` for a real display name (e.g. "Retriever Agent template", "Tool-Using Agent template") when set, "Freeform" otherwise — metadata only, per §3b: `AgentDraft`'s shape, the Level/Mission skeleton, and every generated code panel are byte-for-byte unchanged regardless of template.

**FIX 2 — real agent deletion.** No `DELETE` route existed anywhere before this; every prior removal in this whole session was a manual verification-script cleanup (real Lyzr `DELETE` + raw SQLite deletes), never a real user-facing action. New `services/lyzr.ts`'s `deleteLyzrAgent()` (real `DELETE /v3/agents/:id`, treats Lyzr's own 404 as success — nothing left to delete either way) and `routes/agents.ts`'s `DELETE /:userId/:agentId`: ownership-checked via the same `WHERE user_id = ? AND id = ?` pattern `GET`/`PUT` already use, then real cleanup of every dependent row — `knowledge_docs`/`tool_defs` (keyed by the real Lyzr agent id) and `redteam_runs` (keyed by the internal row id, confirmed by reading the actual insert call in `routes/redteam.ts`, not assumed from the schema comment). **Crew integrity decision:** blocks (409) rather than cascades if the agent is a real `crew_members` row or a `crews.orchestrator_agent_id` — there is no crew edit/repair/delete feature anywhere in this codebase to fall the routing back onto, and `crew_members`/`crews` deliberately key on the *internal* `forged_agents.id` (stable across re-forge, per §6/§27) specifically so crew membership survives a re-forge's new Lyzr id; silently deleting a member would leave a real, currently-deployed crew's `ROUTE_TO` pointing at a Lyzr agent that no longer exists, with no way to fix it. Frontend: "Delete agent" added to the kebab menu on both `FreeformAgentCard` and the old `TiltCard` shipped state (same menu, same real cleanup call). No confirmation pattern existed anywhere else in the codebase to reuse (checked — not even the existing single-doc/single-tool deletes have one), so a native `window.confirm()` is the real, minimal gate: blocks until the user responds, cancels on decline, not a bespoke modal system for one use case. On success the card is removed from local state immediately (no reload) via an `onDeleted` callback threaded down from `CampaignMapScreen`.

**Verified with real calls, no mocks:**
1. Shipped three real agents through the actual UI end to end — one from `?template=retriever`, one from `?template=tool-agent`, one from a blank `/build/new` — then reloaded `/campaigns` fresh: cards read "Retriever Agent template", "Tool-Using Agent template", and plain "Freeform" respectively, exactly matching real provenance. Screenshotted.
2. Confirmed the migration correctly backfills `null` for every agent shipped before this column existed (real pre-existing rows in the live database, unrelated to this session's own test data, read directly — `template_id: null`, no crash, displays as "Freeform").
3. Deleted a real shipped agent via the actual kebab menu: real `window.confirm` fired with the agent's real name, card disappeared with no page reload, and — critically — a direct Lyzr `GET` on that `agent_id` afterward returned **404 "Agent not found"** (proving the real Lyzr deletion, not just a local-state removal), the `forged_agents` row was confirmed gone from SQLite via direct read, and the card stayed gone after a genuine `page.reload()`.
4. Shipped a real 2-specialist crew (both sub-agents + orchestrator + real `POST /api/crew/create` deploy), then attempted deletion of both a real crew member and the real orchestrator, first via direct `curl` (**409**, `"This agent is a real crew member (\"Billing Specialist\")..."` / `"...real crew's orchestrator..."`) and then via the actual kebab-menu UI on the crew member (same real 409 message rendered as a toast, card correctly stayed in the grid) — confirmed via direct SQLite + Lyzr reads that nothing was touched by the blocked attempt (row intact, real Lyzr agent still returns 200).

All real test agents (4 from FIX 1's template/scratch ships, 3 from FIX 2's crew build) deleted from Lyzr + local SQLite afterward (crew member/orchestrator cleanup required clearing `crew_members`/`crews` rows directly first, since the new block correctly refuses the normal delete path for them); all throwaway test users' `users` rows removed; temporary cleanup script removed.

---

## 34. Post-ship hub fix — missing View link, template flow gated behind an unrelated step

Small follow-up to §22/§2f, found by inspection of a real screenshot, not a new phase.

**Bug 1 — freeform's post-ship hub was missing "View".** `FreeformBuildScreen.tsx`'s `ShipPhase` showed 4 links (Talk to Agent / Red Team Arena / Multiverse Compare / Generate Forge Certificate) but not View (`/agent/:id/doc`) — even though View exists both on the `/campaigns` card grid and on the legacy campaign ship screen. Added as a 5th `HubLink`, same real route every other View button already uses.

**Bug 2 — the legacy campaign ship screen (`ShipScreen.tsx`) had all 5 real options coded, but gated them behind the wrong condition.** The agent card reveal, the "give it a knowledge base" panel, the 4-link hub, and the certificate button were all rendered on `agent && showSource` — but `showSource` only flips true after the *entire* typewriter animation finishes displaying a real chat response, which itself only happens after the developer types a test question and clicks "Run your agent" (the same click that also does the real `POST /api/agent/create` via `ensureAgent()`). Net effect: the real agent existed, but every post-ship option stayed invisible until a full test-chat round trip completed — a real, confirmed gap, not a misunderstanding. Fixed by decoupling the four reveal blocks from `showSource`, gating them on `agent` alone (the real creation signal); `showSource` still correctly gates only the inline "src" citation line under the typed answer, which does genuinely need a completed response.

**Verified with real Playwright, no mocks:**
1. Legacy campaign flow (Retriever): typed a test question, clicked "Run your agent" once, and checked the DOM ~1.5s later — **while the button still read "⏳ Running…"** — the flipped agent card, the knowledge-base panel, and all 5 real hub links (View/Talk/Red Team/Compare/Certificate) were already visible. Screenshotted mid-run as direct proof, not inferred from the end state.
2. Freeform flow: shipped a real agent through the full build; confirmed all 5 links present immediately on ship (unchanged, already worked), then clicked the new "View what you learned" link and confirmed it actually routes to the real `/agent/:id/doc` page.
3. Zero console errors in both passes.

Two real test agents ("Hub Test Agent", "Hub Freeform Test") deleted from Lyzr + local SQLite afterward; throwaway test users' `users` rows removed; temporary cleanup script removed.

**Follow-up (same session, found from a real screenshot after §34 shipped):** the 5-link hub only ever lived on the Ship mission's own screen — freeform's separate "Upload Your Knowledge" mission (the real *last* step whenever Knowledge is opted in, e.g. every Retriever-template build by default) showed just "✓ Build complete" and a "Ship another agent" button, no hub at all. Added the identical 5 `HubLink`s to `UploadPhase`'s `done` state in `FreeformBuildScreen.tsx` — same component, so this automatically covers freeform, every template, and Crew sub-agents alike (§3b: one real skeleton). Verified with a real Retriever-template build: shipped, uploaded a real pasted doc, clicked "Finish build →", confirmed all 5 links present on the resulting screen. Screenshotted. Also independently re-verified §32/FIX 4's resume-on-close (typed only a name, closed the tab immediately, reopened — the name was still there) since it was asked about again; confirmed still genuinely working, no code change needed. Test agent deleted afterward.

**Second follow-up — real "table of contents" entry screen.** The very first screen a build ever shows was Level 1's own detail card (Identity/Instructions/Model, "LEVEL 1 OF 3") — the level *count* was verified correct for every case (scratch=2, Retriever=3, Tool-Using Agent=3), but there was no screen that just listed the levels before diving into Level 1's own missions. Added one: `FreeformBuildScreen.tsx` now shows a real "Your build" overview — reusing `MissionIntro` itself (each Level as one "step": `Level 1 — Root Agent`, `Level 2 — Memory`, `Level 3 — Deploy`, etc., pulled from the same real `activeLevels()` data everything else already renders from) — shown exactly once, only when there's genuinely zero progress yet (`startedLevels.size === 0 && completed.size === 0`, not just a "seen" flag, so a resumed in-progress draft never sees it again regardless of session state). Excluded for Crew sub-agent builds (`crewMode`), since `CrewBuildScreen`'s own "Build Each Sub-Agent" Level-intro already frames that correctly and a second overview per sub-agent would be redundant. "Start building →" leads into the exact same Level 1 screen that existed before this change. Verified with real Playwright: scratch/Retriever/Tool-Using Agent all show the correct level list + count on first load, clicking through reaches the original Level 1 detail unchanged; Crew sub-agent build confirmed unaffected (still starts directly at its own Level 1 intro); a real resumed in-progress draft (typed a name, closed, reopened) confirmed to land straight back in the editor with no overview shown again.

**Third follow-up — template-aware draft resume, plus a real clobber bug found and fixed along the way.** The silent auto-resume mechanism (§23) already worked for "Start from scratch" but was unconditionally skipped whenever a `?template=<id>` was present — `FreeformBuildScreen.tsx`'s resume-check effect bailed out on `if (templateId || crewMode)`, so starting a template build, filling in a name, and coming back always re-showed a blank draft. Fixed by (1) adding `templateId: string | null` to the persisted `FreeformSnapshot`, (2) narrowing the skip condition to `if (crewMode)` only, and (3) comparing the saved snapshot's `templateId` against the currently-requested one before restoring anything — so each template (and "Start from scratch") now resumes its own draft independently, never bleeding into another.

Verifying that fix with a real cross-template Playwright run (persistent profile, genuine tab close/reopen) surfaced a more serious, pre-existing bug: the `pagehide`/`beforeunload` flush built in an earlier phase (FIX 4a) fires **unconditionally** on any tab close, and since the backend's `saveProgress` route *replaces* the entire `slotValues` column rather than merging, simply visiting a *different* template and closing the tab — without touching a single field — silently clobbered whatever draft was already saved under the same `__freeform` slot. Reproduced directly: filled a name in a Retriever-template draft, closed the tab (saved correctly); opened a Tool-Using Agent template and closed without typing anything; reopened Retriever — the name was gone (`"(no input)"`). Fixed with a `hasPendingEditRef` boolean ref, set `true` only when a genuine edit or mission-completion schedules a save and cleared once that save actually goes out; the unload flush now checks this ref first and no-ops if nothing is really pending. Applied identically to all three build flows sharing this same flush pattern for the same root cause: `FreeformBuildScreen.tsx`, `CrewBuildScreen.tsx` (`__crew` slot), and `BuildScreen.tsx` (legacy per-campaign flow, flat `slotValues`). Re-ran the exact same cross-template repro after the fix — the Retriever draft's name now correctly survives the intervening Tool-Using Agent visit.

Verified with real Playwright (persistent profile, genuine browser close/reopen via `launchPersistentContext` + `page.close()`, not a fresh context): template-aware resume confirmed correct for Retriever and Tool-Using Agent independently; the clobber repro re-run post-fix showed the Retriever draft's name intact after the intervening visit. Real test `users` rows (no Lyzr agents were ever created — none of the repro runs reached Ship) removed afterward; temporary Playwright script removed.

**Fourth follow-up — real chain-symmetric "← Back" navigation across every screen, not just the editor.** First pass only added Back to the mission editor and pre-ship review, jumping backward by whole missions. A follow-up screenshot review (four consecutive real screens: Build Overview → Level-intro → Mission-overview → Editor) showed that wasn't enough — every one of those screens is a distinct real page in the flow, and only the last had any way back. Reworked to treat the *whole build* as one linear page chain and give every page a real predecessor, mirroring forward navigation exactly:

`Build Overview → Level-intro → Mission-overview → Editor → [Continue] → next Mission-overview → Editor → … → next Level-intro → … → Ship-overview → Ship-review → Upload-overview → Upload-editor`

Each page's "← Back" now targets its true immediate predecessor in that chain, not an arbitrary earlier mission:
- **Editor → this same mission's own overview** (`setView("overview")`, `current` unchanged) — always available, no "first mission" exception, since Continue's forward target is the *next* mission's overview, not a skip.
- **Mission-overview → the previous mission's editor** (new `goToMissionEditor(key)` helper: sets `current` + `view: "editor"` directly, bypassing that mission's own overview since it was already dismissed on the way there) — or, for a level's *first* mission, back to **that level's own intro** (`setView("level")`).
- **Level-intro → the previous level's last mission's editor** — or, for Level 1, back to the **Build Overview** screen (`setBuildOverviewSeen(false)`, re-showing it).
- **Build Overview → nothing** (true first page of a build, no Back rendered — matches Continue never being shown on a page with no forward target either).

`MissionIntro.tsx` gained the actual UI for this: a new `onPrev?`/`prevLabel?` pair rendered as a bordered "← Back" button beside the existing primary CTA at the bottom of the card — distinct from the pre-existing top-right "← Build Map" shortcut (`onBack`, unchanged), which jumps straight into the editor rather than stepping back one page. `ShipPhase` and `UploadPhase`'s own pre-terminal editors got the same one-line fix (`onBack={() => setView("overview")}`, disappearing once that phase is actually done/shipped, since there's nothing left to revise). `BuildScreen.tsx` (legacy per-campaign flow) got the equivalent treatment adapted to its simpler two-screen-per-mission shape (its `[campaignId, missionIdx]` effect always forces `showIntro` back to `true` on any index change, so its intro screen's Back lands on the *previous mission's own intro* rather than that mission's editor — the closest real equivalent this architecture allows, not a shortcut). `CrewBuildScreen.tsx`'s own Level-intro/Mission-overview screens got the *same conservative treatment as the Deploy-screen decision below* — a real back button only where it's genuinely safe.

**Deliberately still scoped out — any Crew-level back that would re-enter an already-shipped `FreeformBuildScreen` instance.** Confirmed via real Playwright (shipped a real 2-specialist crew end to end): `CrewBuildScreen` renders each sub-agent/orchestrator build as `<FreeformBuildScreen key={...} .../>` only while `levelIdx` points at it — navigating away and back **unmounts and remounts** that instance with no memory of already being shipped (its own resume mechanism reads the `__freeform` slot, which Crew builds never write to). Re-entering shows a completely blank "LEVEL 1 OF 2 — Root Agent", and clicking "🚀 Ship agent" there would create a real, second, duplicate Lyzr agent with no cleanup path. So: Level 1's own intro screen can safely go back to Level 0's `DefineCrewEditor` (not a `FreeformBuildScreen`, no remount risk, new `goToLevelEditor()` helper); Level 0/Level 1-first-sub-agent's mission-overview can safely go back to their own level-intro; every other crew-level back (Level 2/3's intros, a later sub-agent's overview, the Deploy screen) was left unwired rather than risk a duplicate agent — same root cause and same decision as the original Deploy→Orchestrator finding, just applied consistently everywhere it applies, not only that one spot.

Verified with real Playwright, no mocks, walking the exact page sequence from the reported screenshots (Tool-Using Agent template):
1. Build Overview ("YOUR BUILD") — 0 Back buttons, confirmed the true first page.
2. Clicked "Start building →" → Level 1 intro ("LEVEL 1 OF 3") — now shows a real "← Back", clicking it correctly lands back on the Build Overview screen (re-verified as its own separate check).
3. Level 1 intro → "Start level →" → Mission 1 ("Identity") overview — "← Back" present, clicking it correctly returns to the Level 1 intro screen.
4. Mission 1 overview → "Begin mission →" → editor — "← Back" now present here too (previously absent for mission 1 specifically, the exact gap the screenshots showed); typed a real name, clicked Back → landed on Mission 1's own overview screen; clicked "Begin mission →" again → the typed name (`"Chain Nav Test Agent"`) was still there, confirming the back-and-forth doesn't lose in-progress data.
5. Zero console errors across the full walk.
6. All 9 real test Lyzr agents from the earlier Crew verification runs deleted for real via the actual `DELETE /api/agents/:userId/:agentId` route from §33 (confirmed that route itself still works correctly as a side effect); all throwaway test `users` rows removed; temporary Playwright scripts removed.

---

## 35. Phase 7b follow-up — closing the last real bypass: POST /api/tools/:agentId

§31 closed row 7b's gap at the two write paths it covered — `POST /api/agent/create` and re-forge (`PUT /api/agents/:userId/:agentId/config`) — but its own text explicitly scoped out a third real entry point: "the weaker `POST /api/tools/:agentId` post-ship registration path (which still only checks non-empty fields, unchanged — out of this task's stated scope)." Re-read that route directly rather than trusting the note: confirmed the gap was still real. `normalizeToolBody()` in `routes/tools.ts` had its own separate, weaker validation — `toolName` got a real snake_case check, but `description` had **no check at all** (not even non-empty), and `endpointUrl` only required non-empty, never checking it against `builtin:weather` or well-formed `http(s)://` (so `"not-a-real-url"` sailed through). This is the actual entry point post-ship tool registration goes through — a tool can reach `tool_defs` here without ever touching `/create` or re-forge, so it needed the identical `validateToolDef` gate, not a fix at `/create` alone.

**routes/tools.ts**: `normalizeToolBody` renamed `parseToolBody` and reduced to parsing only (name/description/endpoint extraction plus the `paramsSchema` per-param type check, which stays here since `validateToolDef` doesn't cover param-schema shape). `POST /:agentId` now calls the same `validateToolDef()` from `services/tools.ts` §31 already established — the identical shared function `/create` and re-forge use, still one real definition of "valid," not a third parallel one — and rejects with `400 { error: "Invalid tool configuration", toolErrors: [{ toolName, errors[] }] }`, matching the exact shape `/create` and re-forge already return. The pre-existing `toolName is required`/`endpointUrl (or a built-in sentinel) is required` early-outs were removed as redundant: `validateToolDef`'s `isValidToolName`/`isValidToolEndpoint` already reject an empty string for both (an empty name fails the snake_case regex, `new URL("")` throws), just with a more specific message — no coverage was lost, only gained. No `PUT` exists on this router (`GET`/`POST`/`DELETE` only) — the user request's "`POST/PUT`" phrasing double-checked against the actual route table; there's nothing to fix on a `PUT` that was never there.

**Verified with real requests, no mocks:**
1. §29/§31's exact bypass case (empty description, `endpointUrl: "not-a-real-url"`) POSTed directly to `POST /api/tools/:agentId` against a real baseline agent (no tools): **400**, `{"error":"Invalid tool configuration","toolErrors":[{"toolName":"sneaky_registry_tool","errors":["description must be a real, non-trivial description (at least 8 characters)","endpointUrl must be \"builtin:weather\" or a well-formed http:// or https:// URL"]}]}` — this exact request would have returned **200** before this fix (per §31's own note that this path was left open).
2. Same endpoint, a real valid tool (`get_weather`/`builtin:weather`): **200**, tool registered normally — confirms the fix doesn't reject the real, working case.
3. Re-confirmed `/create`'s three failure modes independently, fresh, each still individually caught with exactly one error naming the failed field: bad name (`"bad name!"` → snake_case error only), short description (`"short"` → length error only), malformed endpoint (`"ftp://nope.example.com"` → endpoint error only, since `ftp:` isn't `http:`/`https:`).
4. Re-forge re-confirmed independently and freshly: inserted a legacy-shaped bad `tool_defs` row directly into SQLite (simulating an agent that registered a bad tool *before* today's fix existed, since the registration path itself is now closed) — `PUT .../config` correctly **400**'d with the same `toolErrors` shape, refusing to bake it into a fresh agent. Removed that row via the real `DELETE /api/tools/:agentId/:toolId`, retried the same re-forge — **200**, succeeded normally, new `lyzr_agent_id` minted, the real valid tool (`get_weather`) carried forward via `copyToolDefs`.
5. Existing/legacy data confirmed unaffected by the new gate: with that same legacy-bad row still present, `GET /api/tools/:agentId` returned it untouched (**200**, no retroactive validation on read) — the gate only fires on new writes (`POST` registration, `/create`, re-forge), never on reading what's already stored.
6. All real test agents (2 from `/create`, 1 baseline used for the registry tests) deleted for real afterward via the actual `DELETE /api/agents/:userId/:agentId` route from §33; the throwaway test `userId` never actually persisted a `users` row (confirmed directly — `/agent/create` alone doesn't create one, only `/api/progress` does), so there was nothing further to clean up there.

---

## 36. Phase results — real email authentication (Supabase) + closing the userId-trust gap it exposed (row 12)

**Context.** §3's sign-in was documented as "email only, no password" as an intentional design, not a flagged stopgap — but reading the actual code showed it was identity-by-typed-string: `routes/auth.ts`'s old `/login` derived `userId = slugify(email)` and upserted a `users` row immediately, no token, no confirmation, no email ever sent. Auditing every backend route (per this task's own instruction, before touching sign-in) found the real blast radius was much wider than the login screen: `agents.ts` was the *only* file with any ownership check (`WHERE user_id = ?`) at all, and even there `userId` was pure unverified client input; `knowledge.ts`, `tools.ts`, `redteam.ts`'s agent-scoped routes, and `crew.ts`'s crewId routes had **no userId check whatsoever** — some of those tables (`knowledge_docs`, `tool_defs`, `redteam_runs`, `crews`) didn't even have a `user_id` column to check against. Zero auth middleware existed anywhere. Scoped this to a full close of all of it, not just the sign-in screen (explicit user decision after the audit surfaced the gap).

**Id-reconciliation decision.** With `userId` referenced as a raw string across 84 backend call sites and every FK column already typed `TEXT` with no real foreign-key constraints, the least invasive path was chosen: keep every existing table/column shape exactly as-is, and just change *what populates `user_id` going forward* — Supabase's real, verified UUID (`auth.users.id`) instead of `slugify(email)`. On a user's first real verified sign-in, if a legacy row already exists under the old `slugify(email)` id, it's migrated in place (primary key + every FK reference cascaded in one transaction) rather than orphaned — implemented in `services/supabaseAdmin.ts`'s `ensureLocalUser()`.

**Backend (Express, real JWT verification):**
- **Schema** (`db/schema.sql` + migration guard in `db/index.ts`): `users` gained `email TEXT`. `knowledge_docs`, `tool_defs`, `redteam_runs` each gained a nullable `user_id TEXT` — backfilled once via a join through `forged_agents` (the only place an `agent_id → user_id` mapping already existed), so pre-existing rows resolve to whatever `forged_agents.user_id` currently holds rather than staying permanently unownable.
- **`services/supabaseAdmin.ts`**: a backend-only Supabase client using the real `SUPABASE_SECRET_KEY` (Supabase's current name for the service-role key), never exposed to the client. `ensureLocalUser(supabaseUserId, email)` — idempotent, called on every authenticated request: links/creates/migrates the local `users` row as described above.
- **`middleware/auth.ts`**: `requireAuth` — extracts `Authorization: Bearer <token>`, calls `supabase.auth.getUser(token)` (a real round trip to Supabase's auth server, not a local JWT decode), sets `req.userId` to the verified id on success, real `401` otherwise.
- **`services/ownership.ts`**: shared `ownsLyzrAgent`/`ownsForgedAgentId`/`ownsCrew` helpers — one real definition of "does this belong to this verified caller," reused across every route file instead of re-derived per file.
- **Every protected route gated + rewired to trust `req.userId`, never a client-supplied param:** `agent.ts` (`/create`, `/chat`, `/preview`), `agents.ts` (all four CRUD routes — `:userId` stays in the URL only for REST shape, carries no authority), `progress.ts`, `knowledge.ts` (upload/list/delete — this table had *no* ownership concept before), `tools.ts` (register/list/delete — same), `redteam.ts` (attack/judge/history — same), `crew.ts` (`/create` now also verifies the orchestrator + every member forgedAgentId actually belongs to the caller before wiring them into a crew, not just that they exist), `mentor.ts` (Nova's optional `agentId` context is now ownership-checked too).
- **`routes/auth.ts`**: the old `/login` route removed entirely — not left running alongside real auth. Replaced with `GET /session` (`requireAuth`-gated), called once by the frontend right after a real session is established to hydrate progress immediately.

**Frontend (Next.js, real Supabase client):**
- **`lib/supabase.ts`**: real `@supabase/supabase-js` client (PKCE flow), using `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name for the anon key).
- **`components/auth/SignInForm.tsx`**: the one real `signInWithOtp()` call site, reused both inline in `AccountControl`'s header dropdown and full-page at the new `/sign-in` route — not two copies that could drift.
- **`app/auth/callback/`**: real magic-link landing page — `exchangeCodeForSession(code)`, a genuine round trip to Supabase, then redirects to `next` (or `/campaigns`).
- **`lib/session.ts`**: rewritten around a module-level cache mirroring Supabase's real session (primed once via `initAuth()`, kept live via `onAuthStateChange`) so the ~20 existing call sites that read `getUserId()` synchronously didn't all need converting to async — `getUserId()` now returns the real verified Supabase user id, or `""` if signed out (the old random-`localStorage`-UUID anonymous fallback is gone; there is no more "working but not signed in" state, by design). `logout()` is real (`supabase.auth.signOut()`).
- **`lib/api.ts`**: every one of its ~25 `fetch()` calls now goes through a new `authFetch()` that attaches `Authorization: Bearer <token>`; `handle()` reacts to a real `401` by signing out and redirecting to `/sign-in?next=<path>`. The old `loginOrCreateUser()` removed.
- **`components/layout/AuthBoot.tsx`** (new, mounted first in the root layout) + `ProgressSync.tsx` (now awaits `initAuth()` before its first `getProgress()` call, and re-syncs on every real auth change) — closes the real race where a genuinely signed-in user's very first paint could fire a protected request before Supabase's own session had been read back from storage.

**Verified with real Supabase + backend calls, no mocks** (used `supabase.auth.admin.generateLink()` + `verifyOtp()` to obtain real, Supabase-issued session tokens for automated testing in place of clicking a real inbox — the same real auth server round trip a clicked email link triggers, per this task's own suggested approach):
1. Real magic-link sign-in end to end: generated a real link for a real (throwaway) email against the live Supabase project, verified it, got back a real session — `GET /api/auth/session` with that token returned **200** with a freshly-created real `users` row (confirmed directly in SQLite: real UUID id, real email, real derived display name).
2. No token → real **401** `"Missing Authorization: Bearer <token>"`. Bogus token → real **401** `"Invalid or expired session."` (a genuine failed round trip to Supabase, not a local check) — confirmed both before touching real credentials, so a config/env mistake couldn't produce a false pass.
3. Mismatched identity: called `/api/agents/some-other-fake-user-id` (URL) and `POST /api/agent/create` with `{"userId":"attacker-supplied-fake-id", ...}` (body) using a real, valid token — both real writes/reads used the token-verified id, confirmed directly in SQLite (`forged_agents.user_id` = the real Supabase UUID, not the attacker-supplied string).
4. Real two-account cross-user attack simulation: created a second real Supabase account, confirmed it gets real **404**s trying to read (`GET /api/agents/.../:agentId`), delete, chat with (`/api/agent/chat`), and register a tool on (`POST /api/tools/:agentId`) the first account's real agent — then confirmed the real owner's own equivalent calls all still succeed (**200**s): real chat response, real tool registration, real knowledge upload, a real 2-agent Crew (orchestrator + sub-agent) created and chatted with successfully, and the second account correctly blocked (**404**) from that crew too.
5. Real logout: called `supabase.auth.signOut()` on the second account's session, then reused its old (now-revoked) access token against a protected route — real **401**, confirming the session was actually torn down server-side, not just forgotten client-side.
6. Real pre-migration id-reconciliation: since no real `slugify(email)`-keyed account with live data existed in this dev database to test against, constructed a realistic one directly (a `users` row keyed by `slugify("legacy-migration-test@example.com")` with a real `forged_agents` row and a real `tool_defs` row attached, simulating an account that existed before this migration). Signed in for real with that exact email — `ensureLocalUser`'s migration transaction fired: the old row was gone, a new row existed under the real Supabase UUID with the email populated and every stat (`xp: 88`, `rank: "Engineer"`, `streak: 3`) preserved, and both the `forged_agents` and `tool_defs` rows were re-keyed to the new id with zero rows left behind on the old one.
7. Real Playwright pass on `/sign-in`: page renders the real form (email input + "Email me a sign-in link"), no "not configured" error (confirming the Next.js dev server actually loaded the real env vars, not stale ones), zero console errors.
8. All real test data removed afterward: 4 real Lyzr agents deleted via the actual `DELETE /api/agents/:userId/:agentId` route (one manually-seeded fake-Lyzr-id row from point 6 removed directly, since it was never a real Lyzr agent to begin with — expected, not a bug); the real test crew's `crews`/`crew_members` rows cleared directly (no crew-delete route exists, same documented limitation as §33); all 3 local `users` rows removed; all 3 real Supabase auth users deleted via `supabase.auth.admin.deleteUser()` — real cleanup on both sides, not just the local DB.

**Follow-up (same session) — a real, one-click demo account, and two more real races found while making it usable.** Magic-link email has a real, low-by-default Supabase rate limit (hit live during this work) — fine for a real user's own sign-in, not for repeatedly demoing the product. Rather than a fake bypass, created one real, dedicated Supabase account (`demo@forgeflow.dev`, a real password set via `admin.createUser`/`updateUserById`) and added real `supabase.auth.signInWithPassword()` support to `SignInForm.tsx` as a second real sign-in method alongside magic-link (a "🚀 Try the demo" button) — `requireAuth` doesn't care how a session was established, so no backend change was needed. This account can only ever access its own data, same as any other real sign-in; publishing its credentials is the same tradeoff as any public "try it" demo account.

Verifying this live surfaced two more real races, both fixed:
- The demo button originally redirected with a hard `window.location.href` reload. A fresh page load has to re-read the session from Supabase's persisted storage, and that read can race ahead of the just-completed sign-in actually finishing its write — the fresh load briefly saw "signed out", fired a real `401`, and that `401`'s own handler genuinely signed the user back out. Fixed by using client-side navigation (`router.push`, matching how `/auth/callback` already did this correctly) instead, which reuses the session already updated in memory rather than re-reading it from scratch.
- A **second, more general** version of the same race: a real reload (not just the post-sign-in redirect) hit it too, because components that fire a protected request on mount (e.g. `CampaignMapScreen.tsx`'s agent-list fetch) don't all individually wait for `initAuth()` first — only `ProgressSync.tsx` did. Rather than audit and fix every call site individually, moved the wait into `authFetch()` itself (`lib/api.ts`) — every one of the ~25 API calls in this app now awaits `initAuth()` before attaching a token and sending, closing the race everywhere at once. `CampaignMapScreen.tsx`'s own agent-list effect had a second issue on top of that — its `useEffect(..., [])` built the request URL from `getUserId()` read once at mount and never retried, so even after auth became ready the call stayed permanently stale (a real `404 GET /api/agents/` from the empty id, confirmed live); fixed by awaiting `initAuth()` before reading `getUserId()` there too.

Verified with real Playwright: clicked the demo button — real `200` on `/auth/v1/token?grant_type=password` against the live Supabase project, landed on `/campaigns` showing this account's real XP/rank/leaderboard position and a real previously-shipped agent card (`ForgeMaster`, `180 XP`, a real forge-scored agent — genuine prior usage of this exact account, left alone rather than wiped, since it's plausibly real usage and not test debris this session created). Reloaded three times in a row: session held every time, zero console errors on the final pass (down from 2 real `404`s per reload before the `CampaignMapScreen.tsx` fix).

---

## 37. Deployment-readiness audit — Vercel (frontend) + backend hosting

Audited the whole app for real deploy blockers, not just "does `next build` pass."

**Frontend — genuinely Vercel-ready.** `npx next build` succeeds cleanly (all 18 routes, including `/sign-in` and `/auth/callback`'s `useSearchParams` usage, correctly wrapped in `Suspense`). No Next.js API routes, no `middleware.ts`, no hardcoded `localhost` outside the one documented `NEXT_PUBLIC_API_URL` dev fallback in `lib/api.ts`. The dev-only `window.__forgeflowSupabase` hook (§36's follow-up) is gated on `NODE_ENV !== "production"`, which Next.js sets for real on `next build`/Vercel — confirmed dead-code-path, not shipped.

**Backend — real blocker found and partially fixed, one decision required.**
1. **No production build existed at all** — `package.json` only had `dev` (`ts-node-dev`, a watch-mode dev tool) and a placeholder `test`. Added real `build` (`tsc -p .` + a copy step) and `start` (`node dist/index.js`) scripts.
2. **The compiled build was broken** — `db/index.ts` reads `schema.sql` via `fs.readFileSync(path.join(__dirname, "schema.sql"))` at runtime, but `tsc` only compiles `.ts` files; `schema.sql` never made it into `dist/`. `npm start` on a real fresh compile would have thrown `ENOENT` immediately on boot. Fixed: `build` now copies `src/db/schema.sql` to `dist/db/schema.sql` as its final step. Verified for real: fresh `rm -rf dist && npm run build`, then booted the actual compiled `dist/index.js` on a throwaway port/DB — real `200` on `/api/health`, process killed and throwaway DB file removed afterward.
3. **better-sqlite3 (a local file on disk) is fundamentally incompatible with Vercel's serverless model** — its ephemeral, per-invocation filesystem doesn't durably persist file writes, which would silently break every real, persisted feature this whole session's work depends on (agents, progress, tool_defs, knowledge, everything). Raised this directly rather than silently deploying something that degrades data integrity; user chose **Railway or Render** — a plain long-running Node host, zero code changes needed, SQLite keeps working exactly as it does today. Added `render.yaml` (a real Render Blueprint: build/start commands, and critically a **persistent disk** mounted at `/var/data` — Render/Railway's default container filesystem is *also* not persistent across redeploys, so a disk/volume must be explicitly attached or every redeploy wipes the database; the same caveat applies if deploying to Railway instead, via its own Volumes feature).
4. **`.env.example`** added for both `frontend` and `backend` (real, valueless templates — no secrets), documenting every variable §12 already lists, so a fresh deploy's required env vars are never guessed.

**Manual steps that need a real dashboard, not code (flagged, not silently skipped):**
- **Supabase's Auth → URL Configuration → Redirect URLs allow-list** must include the real production frontend URL (and `/auth/callback`) once known — `signInWithOtp`'s `emailRedirectTo` already uses `window.location.origin` (so it automatically becomes correct in production), but Supabase itself will reject a redirect to a URL not on this allow-list.
- **`FRONTEND_URL`** (backend CORS) and **`NEXT_PUBLIC_API_URL`** (frontend) need the real production URLs once both hosts exist — chicken-and-egg on a first deploy, so plan on one redeploy of each side after the other's URL is known.
- **Key rotation recommended before going public**: §12's existing security note (Qdrant/Google keys were shared in plaintext chat during setup) becomes a real exposure risk once the app is live rather than local-only — worth rotating those two keys as part of this deploy, not deferred further.

---

## Appendix A — Source audit

Built from two verified read-only audits of the existing codebase, which confirmed: Lyzr's real create-agent schema (no tool_calling field, no documented knowledge_base_id/rag_config); current knowledge grounding was long-context stuffing, not retrieval; current Red Team judging was keyword substring matching; Nova is a statically Studio-provisioned agent (the pattern Redcap follows); Multi-Agent Crew had zero backing data; no vector DB/embeddings library/Lyzr SDK existed in either package.json originally.

---

## Current state / what's next — the complete picture

Real and verified, all built and Playwright-tested: agent create/chat/re-forge; knowledge upload to chunk to embed to Qdrant to per-query retrieval (§15); freeform builder logic + mission-style 3-column layout + Levels/Missions/Subtasks, including template-driven Level defaults (§17/§19/§21); inline code-editor slot-filling with real per-field validation, now covering Tools and Crew's role-label list too, not just Identity/Instructions/Model (§20, §32); real tool execution loop (§18); post-ship hub, persistent agent cards, and the /campaigns section split all working for freeform agents (§22, §24); build resume/autosave for freeform, Crew, and the legacy campaign flow, all independently re-verified with a real browser close/reopen and two real races found and fixed along the way (§23, §32); Red Team Arena fully dynamic and Redcap-judged, with live incremental per-attack progress and a correctly-counted "scientist" achievement (§25-§26); Multi-Agent Crew, its own Build Type, own 4-level flow, real ROUTE_TO routing between real independently-shipped sub-agents, embedded-header overlap fixed (§27, §32); Nova platform-wide RAG-grounded in ForgeFlow's own docs, plus real per-agent forge-score/config context on Doc pages (§28); Forge Score's tool-config bucket now a real per-tool validity check instead of a flat grant, verified across freeform, template, and crew sub-agent shipping paths (§29); "Tool-Using Agent" and "Multi-Agent Crew" cards on /campaigns unlocked and routing correctly, confirmed at the raw server-rendered-HTML level with a cache-ruled-out cold navigation (§30); real backend-side tool-config validation at /create and re-forge, reusing §29's own validity checks, plus a frontend ToolsEditor gap it uncovered (§31); "Your Agents" cards show real template provenance instead of a generic "Freeform" tag, and real agent deletion (real Lyzr delete, real dependent-row cleanup, crew-integrity-blocked rather than cascaded) is a genuine user-facing action for the first time (§33); template-based builds now silently resume drafts the same way "Start from scratch" always did, a real cross-template data-clobber bug found while verifying that was fixed across all three build flows, and every real page in the build chain — Build Overview, Level-intro, Mission-overview, Editor, Ship/Upload — now has chain-symmetric "← Back" navigation to its true predecessor, deliberately scoped away from any Crew-level case that would remount an already-shipped sub-build after a real duplicate-agent risk was found there (§34); backend-side tool-config validation now covers all three real write paths a tool can enter through — /create, re-forge, and post-ship registration via POST /api/tools/:agentId, the one §31 had explicitly left open — one shared validateToolDef definition, no drift between what scores well and what's allowed to ship (§35); sign-in is real Supabase magic-link email authentication, not identity-by-typed-string — every protected backend route now verifies a real JWT server-side and uses that verified identity for every ownership check rather than trusting a client-supplied userId, and the audit this required closed a much wider gap than the login screen alone (real user_id columns + ownership checks added to knowledge_docs/tool_defs/redteam_runs/crews, none of which had any before), verified with two real Supabase accounts attacking each other's data (§36).

Resolved this session: row 5b, MCP Tool Agent, decided as a template (same as Phase 3 Tools), not a new Build Type. See §3b for the full rationale.

Deliberately deprioritized, not scheduled: rows 8 (story copy cleanup) and 9 (story personalization) — explicit call, both skipped for now rather than built.

Still mock, hardcoded, or missing:
- Firefox verification of Phase 2d's fixes still pending (sandbox limitation, not a known defect)
- MentorPanel.tsx's header "Context · ..." label always shows the static per-screen default (mentor.ctx), never the dynamic context string actually sent to the backend, a pre-existing cosmetic mismatch noticed while verifying §28, not introduced by it, not fixed (out of that task's scope)

Decided, not a bug: Redcap's 5th attack category reads as contradiction_pressure rather than the contradiction_trap name the backend's ATTACK prompt requests, accepted as the real category name rather than re-editing a working, verified Redcap agent (§7).

No blocking open items remain. What's left (Firefox verification, MentorPanel context-label cosmetic fix) is non-blocking, no particular order required.

Claude Code prompts for each phase are drafted here as we get to them, matching what's already been validated in every phase above.