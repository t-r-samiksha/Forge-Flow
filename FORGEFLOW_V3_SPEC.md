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
| 2c | Inline code-editor slot-filling | The code editor is the only input surface, real inline select/input slots two-way bound to AgentDraft; real per-field lint drives console/badges/gates. | Done, real Playwright-verified (§20) |
| 2d | Freeform builder fixes | Sidebar clipping fixed; cloned templates surface values as placeholder hints, not filled-in defaults. | Done, Chrome-verified (§20). Firefox verification blocked by a sandbox network limitation, not a known cross-browser issue |
| 2e | Levels to Missions to Subtasks restructuring | Group the existing freeform missions under a Level-intro screen layer, matching the old campaign's 3-tier structure. Full spec in §3b's Levels subsection. | Done, real Playwright-verified (§21). Follow-up: templates now default-opt-in the Level their template implies (Retriever→Memory, Tool-Using Agent→Tools), structural only, field values still hints-only (§21) |
| 2f | Post-ship hub restored for freeform agents | Replace the freeform Ship screen's bare Test Console with the real post-ship hub, and fix all four destination screens' hidden campaign dependency so they work for freeform (campaignId: "custom") agents. | Done, real Playwright-verified (§22) |
| 2g | Persistent agent cards + freeform build resume | Restore card-grid access (Talk/View/Red Team/Compare/Certificate) to every previously-shipped freeform agent from /campaigns; autosave/resume an in-progress freeform build. Also fixes AgentDocScreen's own campaign dependency, flagged-not-fixed in §22. | Done, real Playwright-verified (§23) |
| 2h | /campaigns split into two sections | Separate templates ("Start a Build") from shipped-agent cards ("Your Agents"). | Done, real Playwright-verified (§24) |
| 2i | Red Team Arena live progress + achievement counter | Restore live incremental attack-by-attack display; red-team chats now count toward the "scientist" achievement. | Done, real Playwright + curl-verified (§26) |
| 2j | "Tool-Using Agent" / "Multi-Agent Crew" showing locked "soon" cards on /campaigns | Both cards showed lock/"soon" states contradicting already-real functionality (Tools since §18, Crew since §27) | Done, real Playwright-verified at the raw server-rendered-HTML level with a cache-ruled-out cold navigation (§30). Tool-Using Agent's lock was a real leftover campaign-progression gate (unlockAfter: "retriever" plus a store-gated LockedCard render), now removed. Multi-Agent Crew was confirmed already correctly unlocked in the live code and render — no change needed there; the earlier report was very likely a stale screenshot/cache, not a regression. |
| 3 | Tool execution loop | Real TOOL_CALL marker + backend interception + real webhook invocation | Done, real smoke-tested (§18) |
| 4 | Red Team Arena to Redcap | Dynamic attack generation + real LLM judgment | Done, real Playwright + curl-verified (§25). See naming-decision note at the end of §7 re: contradiction_pressure vs contradiction_trap. |
| 5 | Multi-agent crews | Real sub-agents + real orchestrator routing, own Level-based build flow (see expanded §6) | Done, real Playwright + curl-verified (§27) |
| 5b | MCP Tool Agent, scope decision | Real MCP (server discovery, tool listing, auth handshake) or just our existing webhook-based Tools (Phase 3) under the old reference's name? | Decided: same as Phase 3 Tools, not a separate Build Type. No real MCP protocol work planned. See §3b for the resolved text and rationale. |
| 6 | Nova platform-wide RAG | Ground Nova in real ForgeFlow docs via forgeflow_docs Qdrant collection | Done, real curl + Playwright-verified (§28) |
| 7 | Forge Score fix | Tool-config completeness currently auto-grants 15 flat points regardless of validity | Done, real curl + Playwright-verified (§29) |
| 7b | Backend accepts invalid tool config that the UI itself blocks | POST /api/agent/create doesn't reject an empty description or a malformed (non-http(s)://, non-builtin:) endpoint — only the frontend's ToolsEditor enforces this. Found while verifying §29 (had to bypass the UI via direct API call to construct a real invalid-config test case). | Done, real curl + Playwright-verified (§31). /create and re-forge now hard-reject with a 400 and itemized errors, reusing §29's own validity checks (one shared definition of "valid," not a third parallel one). The frontend ToolsEditor also gained a description check it was missing, found during real verification of this fix. |
| 8 | Story copy cleanup | Still says "Meridian Labs" in story screens | Deprioritized, not scheduled — explicit call: skip for now. |
| 9 | Story personalization (optional) | Let developer describe their real use case instead of a fixed narrative | Deprioritized, not scheduled — explicit call: skip for now, was always optional/undecided anyway. |

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
  v
Next.js frontend (localhost:3000)
  |
  v
Express backend (localhost:4000)
  |
  |--> SQLite (agentforge.db)              -- app state, config, history
  |--> Qdrant Cloud (free tier)             -- vector storage for knowledge
  |--> Google Gemini embeddings API         -- turns text into vectors
  +--> Lyzr Agent Platform (agent-prod.studio.lyzr.ai/v3) -- the actual LLM agent runtime
```

---

## 3. What data we ask the user for, and when

| Step | What's asked | Required? |
|---|---|---|
| Sign in | Email only (no password) | Yes |
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

forged_agents/users/achievements unchanged. Qdrant: one collection per agent (agent_<forged_agent_id>), plus forgeflow_docs for Nova. Lyzr: the actual runtime, model inference, sessions, message history.

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
7b. Open, backend accepts invalid tool config the UI blocks. Next up.
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

## Appendix A — Source audit

Built from two verified read-only audits of the existing codebase, which confirmed: Lyzr's real create-agent schema (no tool_calling field, no documented knowledge_base_id/rag_config); current knowledge grounding was long-context stuffing, not retrieval; current Red Team judging was keyword substring matching; Nova is a statically Studio-provisioned agent (the pattern Redcap follows); Multi-Agent Crew had zero backing data; no vector DB/embeddings library/Lyzr SDK existed in either package.json originally.

---

## Current state / what's next — the complete picture

Real and verified, all built and Playwright-tested: agent create/chat/re-forge; knowledge upload to chunk to embed to Qdrant to per-query retrieval (§15); freeform builder logic + mission-style 3-column layout + Levels/Missions/Subtasks, including template-driven Level defaults (§17/§19/§21); inline code-editor slot-filling with real per-field validation (§20); real tool execution loop (§18); post-ship hub, persistent agent cards, build resume, and the /campaigns section split all working for freeform agents (§22-§24); Red Team Arena fully dynamic and Redcap-judged, with live incremental per-attack progress and a correctly-counted "scientist" achievement (§25-§26); Multi-Agent Crew, its own Build Type, own 4-level flow, real ROUTE_TO routing between real independently-shipped sub-agents (§27); Nova platform-wide RAG-grounded in ForgeFlow's own docs, plus real per-agent forge-score/config context on Doc pages (§28); Forge Score's tool-config bucket now a real per-tool validity check instead of a flat grant, verified across freeform, template, and crew sub-agent shipping paths (§29); "Tool-Using Agent" and "Multi-Agent Crew" cards on /campaigns unlocked and routing correctly, confirmed at the raw server-rendered-HTML level with a cache-ruled-out cold navigation (§30); real backend-side tool-config validation at /create and re-forge, reusing §29's own validity checks, plus a frontend ToolsEditor gap it uncovered (§31).

Resolved this session: row 5b, MCP Tool Agent, decided as a template (same as Phase 3 Tools), not a new Build Type. See §3b for the full rationale.

Deliberately deprioritized, not scheduled: rows 8 (story copy cleanup) and 9 (story personalization) — explicit call, both skipped for now rather than built.

Still mock, hardcoded, or missing:
- Firefox verification of Phase 2d's fixes still pending (sandbox limitation, not a known defect)
- MentorPanel.tsx's header "Context · ..." label always shows the static per-screen default (mentor.ctx), never the dynamic context string actually sent to the backend, a pre-existing cosmetic mismatch noticed while verifying §28, not introduced by it, not fixed (out of that task's scope)

Decided, not a bug: Redcap's 5th attack category reads as contradiction_pressure rather than the contradiction_trap name the backend's ATTACK prompt requests, accepted as the real category name rather than re-editing a working, verified Redcap agent (§7).

No blocking open items remain. What's left (Firefox verification, MentorPanel context-label cosmetic fix) is non-blocking, no particular order required.

Claude Code prompts for each phase are drafted here as we get to them, matching what's already been validated in every phase above.