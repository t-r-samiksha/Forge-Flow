# Agent Forge — Technical Reference (matches shipped code)

> **What this is:** A gamified, educational platform where developers learn
> to build real AI agents through guided, step-by-step missions. A campaign
> ends with a working agent running live on Lyzr. After shipping, the
> campaign's card on `/campaigns` swaps in two actions: **View** (a static
> documentation notebook covering what was learned) and **Talk to Agent**
> (a dedicated chat screen).
>
> This file was originally written as a pre-build spec (five campaigns, an
> "Agent Hub" with live Study/Edit toggling, a leaderboard, a landing page).
> Some of that never got built, some got built and then simplified, and some
> was superseded by a different design (see `CLAUDE.md`, which is the
> current source of truth for navigation). This rewrite describes what's
> actually in the repo today. Where something in the original vision was
> deliberately dropped or left half-wired, it's called out explicitly rather
> than silently omitted — see **§11 Known gaps & orphaned code**.

---

## 1. Architecture overview

```
┌────────────────────────────────────────────────────────────────┐
│                       FRONTEND                                 │
│               Next.js 14 (App Router) + TypeScript              │
│              Tailwind CSS · Framer Motion · Zustand             │
│                                                                │
│  '/' redirects to '/story/retriever' — no standalone landing.  │
│                                                                │
│  Guided flow (linear, mission-locked):                         │
│  Story → Campaigns (hero + grid) → Setup → Build → Ship        │
│                                                                │
│  Post-completion (from the campaign card on /campaigns):       │
│  View (→ /agent/[agentId]/doc)  |  Talk to Agent (→ .../chat) │
│                                                                │
│  Signature features actually shipped:                          │
│  1. Live Agent Blueprint (SVG) — nodes ignite, wires draw,     │
│     data packets travel the path during Build                 │
│  2. Documentation Notebook — static, scrollable study guide    │
│     built from each campaign's own copy + the agent's config   │
│  3. Dedicated chat screen for the shipped agent                │
│  4. Agent card flip reveal on Ship Day (Framer rotateY)        │
└────────────────────────┬─────────────────────────────────────┘
                         │ fetch
┌────────────────────────▼─────────────────────────────────────┐
│                      BACKEND                                  │
│                 Express.js (Node/TS) + better-sqlite3          │
│                                                                │
│  POST /api/agent/create          → Lyzr create + persist row  │
│  POST /api/agent/chat            → Lyzr inference             │
│  GET  /api/agents/:userId        → all forged agents for user │
│  GET  /api/agents/:userId/:id    → one forged agent + config  │
│  PUT  /api/agents/:userId/:id/config → re-forge with new      │
│         config (real, working — no UI calls it; see §11)      │
│  POST /api/mentor/chat           → Lyzr inference on Nova      │
│  GET  /api/progress/:userId      → xp, rank, streak, unlocks  │
│  POST /api/progress/:userId      → save checkpoint, computes  │
│         real streak + awards streak_master achievement        │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS, x-api-key from backend/.env only
┌────────────────────────▼─────────────────────────────────────┐
│                     LYZR API                                  │
│          https://agent-prod.studio.lyzr.ai/v3                 │
│  POST /agents/          — create agent                        │
│  POST /inference/chat/  — send message, get response           │
└────────────────────────────────────────────────────────────────┘
```

There is no `/api/campaigns` route — campaign/mission data is a static
TypeScript module (`frontend/lib/campaigns.ts`) imported directly by the
components that need it, not served over HTTP. There is no SSE streaming
route and no `/api/leaderboard` — the leaderboard was never built (see §11).

---

## 2. What the two post-ship experiences actually do

### Guided build
Linear, mission-locked. Each mission asks for one decision (fill a slot),
lints it live, lights up the matching node/wire on the blueprint, and won't
let you continue until every slot in the mission passes. Encouragement
toasts fire at 1st slot / halfway / all-slots-filled within a mission
(`BuildScreen.tsx`, wired to the copy in §9).

### View → Documentation Notebook (`/agent/[agentId]/doc`)
A single static page (`AgentDocScreen.tsx`), not a Study/Edit toggle.
Top to bottom:
1. Hero: build time, XP earned, mission count, stack label
2. Sticky table of contents (scroll-spy highlights the active section)
3. Overview (two paragraphs of campaign-specific copy)
4. One section per mission: sitrep recap, the trade-off tabs from Build,
   the exact code the user wrote (`docCode.mission1/mission2`, rendered
   from the agent's real saved `config`), and — new — a `ConceptCard` per
   `inspectorSection` scoped to that mission: an expandable "What you
   learned" summary with a "Deep dive →" link
5. Full assembled agent code
6. Glossary
7. CTA to the chat screen

There is no edit mode, no diff panel, no in-page test console. Those exist
as components (§11) but nothing on this page renders them.

### Talk to Agent (`/agent/[agentId]/chat`)
Dedicated chat UI (`AgentChatScreen.tsx`) against the real shipped Lyzr
agent via `POST /api/agent/chat`.

---

## 3. Tech stack (actual `package.json` dependencies)

### Frontend
- **next** 14, App Router, TypeScript strict mode
- **react** / **react-dom**
- **framer-motion** — all animation
- **zustand** — global state
- **lucide-react** — icons (used in `CampaignMapScreen`, `MentorPanel`,
  `TopBar`, `CodeStructureSection`)

No `react-hot-toast` — toasts are hand-rolled: `lib/effects.ts` dispatches
a `forge:toast` window event, `components/gamification/Toast.tsx` listens
and renders it with Framer Motion.

### Backend
- **express** (TypeScript) — REST only, no SSE
- **dotenv**, **cors**, **uuid**
- **better-sqlite3** — synchronous, file-backed persistence

### Dev tooling
- ESLint (Next.js config)
- `concurrently` to run both dev servers from root

---

## 4. Screen flow — actual routes

| Route | Component | Notes |
|---|---|---|
| `/` | — | `redirect("/story/retriever")`, no landing page |
| `/story/[campaignId]` | `StoryScreen` | typewriter + stats cold-open |
| `/campaigns` | `CampaignMapScreen` | hero + campaign grid; doubles as the post-completion hub — a shipped campaign's card shows View / Talk to Agent instead of Start |
| `/setup/[campaignId]` | `SetupScreen` | clone-vs-scratch, animated terminal |
| `/build/[campaignId]` | `BuildScreen` | 3-column: Mission Rail \| Code Editor + Console \| Live Blueprint |
| `/ship/[campaignId]` | `ShipScreen` | run button → real Lyzr response → agent card flip reveal → View / Talk to Agent |
| `/agent/[agentId]/doc` | `AgentDocScreen` | static documentation notebook, described in §2 |
| `/agent/[agentId]/chat` | `AgentChatScreen` | dedicated chat with the shipped agent |
| `/leaderboard` | — | parked: `redirect("/campaigns")`. Route file exists with a comment explaining it's out of scope for the current reference design; safe to re-enable later (see §11) |

`components/screens/LandingScreen.tsx` exists in the repo but is not
imported by any route — dead code from before the Story→Campaigns merge
(see §11).

---

## 5. Educational framework — 5 pillars

Still accurate — this is the data-driven backbone both live campaigns
share (`Mission.tabs`, `InspectorSection`, lint rules in `lib/lint.ts`):

```
Pillar 1: MODEL SELECTION
  What: Choosing the LLM
  Learn via: trade-off tabs in Build, Concept Card in the doc

Pillar 2: INSTRUCTION DESIGN
  What: The system prompt / agent instruction
  Lint rule: warn if too short / no stated constraint

Pillar 3: KNOWLEDGE CONFIGURATION
  What: Vector DB collection + top_k (Retriever campaign)
  Lint rule: warn if top_k out of the sane range

Pillar 4: TOOL INTEGRATION
  What: External APIs, routing, fallback (Tool-Using Agent campaign)
  Lint rule: warn if no fallback defined

Pillar 5: TUNING & BEHAVIOR
  What: Temperature and its effect on reliability
  Lint rule: campaign-specific thresholds
```

Each campaign only exercises the pillars relevant to it — Retriever
doesn't teach tool integration, Tool-Using Agent doesn't teach knowledge
config. `Campaign.inspectorSections` is what maps pillars to concept cards
in the doc notebook.

---

## 6. Lyzr API integration

### 6a. Create agent (Ship Day → `POST /api/agent/create`)
```
Backend calls: POST https://agent-prod.studio.lyzr.ai/v3/agents/
Headers: Content-Type: application/json, x-api-key: <LYZR_API_KEY>
Body: { name, description, agent_role, agent_instructions, agent_goal,
        provider_id: "openai", model, temperature, top_p: 1,
        store_messages: true }
Response: { agent_id }
```
The backend persists the forged agent row, computes `forgeScore`
(`services/forgeScoring.ts` — see caveat in §11), and awards any
achievements that just became true (`first_forge`, `speed_forge`,
`zero_hallucination`, `collection_start` — see §9).

### 6b. Chat inference (`POST /api/agent/chat`)
```
Backend calls: POST .../v3/inference/chat/
Body: { user_id, agent_id, session_id, message }
Response: { response }
```
Also increments `chat_queries_run` for the `scientist` achievement.

### 6c. Re-forge (`PUT /api/agents/:userId/:agentId/config`)
Real and working, but has no UI entry point (see §11). Merges
`updatedSlots` into the stored config, re-creates the Lyzr agent,
recalculates forge score, bumps `version`.

### 6d. Mentor agent ("Nova") (`POST /api/mentor/chat`)
Pre-created Lyzr agent, `LYZR_MENTOR_AGENT_ID` in `backend/.env`. Also
increments `mentor_questions_asked` for the `mentors_favorite` achievement.

There is no streaming endpoint — responses come back as a single JSON
`response` field and are typed out client-side character-by-character
(`ShipScreen.tsx`'s `typeOut`), not via SSE.

---

## 7. Design tokens

```css
/* Backgrounds */
--void:       #07070c
--panel:      #101018
--panel-2:    #15151f
--panel-3:    #1c1c28
--code-bg:    #0a0a11

/* Borders */
--line:       #22222f
--line-2:     #2e2e3d

/* Text */
--text:       #eaeaf4
--dim:        #9494a8
--mute:       #56566a

/* Accents */
--violet:     #8b5cf6       /* primary */
--violet-hi:  #a78bfa
--plasma:     #22d3ee       /* secondary (cyan) */
--plasma-hi:  #67e8f9
--spring:     #34d399       /* success */
--amber:      #fbbf24       /* warnings */
--rose:       #fb7185       /* danger / story tension */

/* Typography */
--font-display: 'Space Grotesk', sans-serif
--font-body:    'Inter', sans-serif
--font-mono:    'JetBrains Mono', monospace
```

---

## 8. Animation catalog

| Animation | Screen | Status |
|---|---|---|
| Boot sequence | App load | ✅ `components/effects/BootSequence.tsx` |
| Starfield | All (bg) | ✅ `components/effects/Starfield.tsx` (canvas) |
| Ambient grid/orbs | All (bg) | ✅ `components/effects/AmbientBackground.tsx` |
| Story typewriter + stats count-up | Story | ✅ |
| 3D card tilt | Campaign map | ✅ `CampaignMapScreen.tsx` |
| Code typewriter, active-line glow, slot fill pop | Build | ✅ `CodeEditor.tsx` / `Slot.tsx` |
| Node ignite, wire draw, data packets | Blueprint | ✅ `BlueprintNode/Wire/DataPacket.tsx` |
| XP fly, level-up burst, confetti | Milestones | ✅ `lib/effects.ts` |
| Toast slide | Notifications | ✅ `gamification/Toast.tsx` |
| Medal bounce | Ship day | ✅ CSS keyframe in `ShipScreen.tsx` |
| Response typewriter | Ship day + Chat | ✅ |
| **Card flip reveal** | Ship day | ✅ `components/ship/AgentCardReveal.tsx` — Framer `rotateY: 0→180` |
| Concept card expand | Documentation | ✅ `hub/ConceptCard.tsx` — height/opacity, not a scroll-triggered reveal |
| Badge unlock | Any | ✅ toast + confetti on `unlockAchievements` |
| Mentor slide-in | Mentor | ✅ `layout/MentorPanel.tsx` |
| Leaderboard entry stagger | Leaderboard | ❌ not built — screen was cut (§11) |
| Diff highlight, re-forge ripple, version bump | Documentation edit mode | ❌ not built — edit mode was cut (§11) |

**All animations respect `prefers-reduced-motion`** via `lib/effects.ts`'s
`reducedMotion()` helper, checked at each animation's call site.

---

## 9. Gamification system (as actually computed)

### XP and ranks
```
0–39 XP     → Recruit
40–74 XP    → Engineer     (level-up burst)
75–149 XP   → Architect    (level-up burst)
150+ XP     → Forgemaster  (level-up burst)
```
`lib/store.ts`'s `rankForXp` and the backend's `progress.ts` compute this
identically client- and server-side.

### Forge Score (0–100 per agent) — `backend/src/services/forgeScoring.ts`
- Instruction quality: +20 max, scales with `config.instr` length
- Temperature appropriateness: +15 max, peaks near 0.3
- Model selected: +15 flat if `config.model` is set
- Knowledge config quality: +20 max, based on `config.ret` (top_k)
- Tool config completeness: +15 flat (auto-granted — not actually scored)
- Completion speed bonus: +15 max, relative to the campaign's estimate

**Caveat:** this function reads hardcoded Retriever config keys (`instr`,
`temp`, `ret`). The Tool-Using Agent campaign's config keys are different
(`router_instr`, `tool_name`, `fallback`, no `ret`) — it currently scores
near the floor (model + speed + the flat tool bonus only) regardless of
build quality. Same limitation applies to the `/config` re-forge route,
which also assumes `instr`/`model`/`temp`. Generalizing both to read a
campaign-declared key mapping is unfinished work, not a bug you're missing
something about.

### Achievements — actually computed (`services/achievements.ts`)
```
first_forge         — shipped your first agent
speed_forge          — shipped in under 15 minutes
zero_hallucination    — shipped with temperature ≤ 0.2
collection_start      — forged 3 different agents
mentors_favorite      — asked Nova 10+ questions
scientist              — ran 20+ test queries against a shipped agent
streak_master          — maintained a 7-day forge streak
```
Deliberately **not** implemented (were in the original aspirational list,
don't map cleanly onto what's built): `Full Wiring`, `Crew Chief` (no
multi-agent crew campaign exists), `Perfectionist`, `Tinkerer` (no edit
mode to count edits from).

### Streak — real computation (`progress.ts`'s `computeStreak`)
Same calendar day as last activity → unchanged. Exactly one day later →
+1. Anything else (first activity ever, or a skipped day) → reset to 1.
This used to be a client-sent value passed straight through with no
server-side check; it's now computed from `last_forge_date` server-side.

### Encouragement toasts — wired into `BuildScreen.tsx`
Fire once per mission, keyed by slot-fill milestones:
- 1st slot filled → "First decision made ⚡"
- halfway through the mission's slots (skipped for 2-slot missions —
  it would coincide with "first" and double-fire) → "Halfway there 🎯"
- last slot filled → "All systems go — ready to continue 🚀"

The two ship/edit-oriented lines from the original list — "Your agent is
live..." and "Configuration updated — agent evolved." — aren't wired
anywhere; the first is superseded by the ship-day flip reveal + typed
response, the second belongs to the re-forge flow that has no UI (§11).

---

## 10. Zustand store (`frontend/lib/store.ts`)

```typescript
interface GameState {
  booted: boolean;

  // Progress
  xp: number;
  rank: 'Recruit' | 'Engineer' | 'Architect' | 'Forgemaster';
  completedCampaigns: string[];
  completedMissions: string[];
  unlockedCampaigns: string[];
  achievements: string[];
  streak: number;
  timerSeconds: number;
  timerRunning: boolean;
  progressLoaded: boolean;

  // Build state
  currentLevelIndex: number;
  currentMissionIndex: number;
  slotValues: Record<string, string>;

  forgedAgents: ForgedAgent[];

  // Orphaned — see §11. Nothing reads these.
  inspectorMode: 'study' | 'edit';
  inspectorDirtySlots: Record<string, string>;

  mentorOpen: boolean;
  activeContext: string | null;

  // actions: setBooted, startTimer, setSlot, addXp, completeMission,
  // unlockCampaigns, unlockAchievements, hydrateProgress, tick,
  // toggleMentor, setActiveContext, forgeAgent, updateForgedAgent,
  // setInspectorSlot, toggleInspectorMode, resetInspector
}
```

`ForgedAgent` mirrors the backend's `forged_agents` row exactly (camelCase):
`id, campaignId, name, lyzrAgentId, config, originalConfig, lyzrPayload,
forgeScore, forgeTime, xpEarned, version, forgedAt, lastEditedAt?`.

---

## 11. Known gaps & orphaned code

Kept here instead of silently dropped, so nobody re-discovers these by
accident and assumes they're bugs:

- **`components/screens/LandingScreen.tsx`** — full hero/feature-showcase
  landing page, never wired to any route. `'/'` redirects straight to
  `/story/retriever` per `CLAUDE.md`.
- **`app/leaderboard/page.tsx`** — parked. Redirects to `/campaigns`, with
  a comment explaining the reference design has no leaderboard screen.
  `GET /api/leaderboard` was never built either. Route kept so re-enabling
  it later doesn't require re-plumbing.
- **`components/hub/ActionsPanel.tsx`, `ConfigDiff.tsx`,
  `InspectorSection.tsx`, `TestConsole.tsx`, `CodeStructureSection.tsx`** —
  built for a Study/Edit-mode Documentation Notebook (re-forge inline,
  diff original vs. edited config, in-page test console) that was
  simplified down to the static `AgentDocScreen` described in §2. None are
  imported anywhere. Only `hub/ConceptCard.tsx` from that batch made it
  into the shipped page.
- **`store.ts`'s `inspectorMode` / `inspectorDirtySlots` /
  `toggleInspectorMode` / `setInspectorSlot` / `resetInspector`** — state
  for the same cut edit-mode flow. No component reads or calls them.
- **`PUT /api/agents/:userId/:agentId/config`** — the backend half of
  re-forge is real and functionally correct, just has no UI entry point
  and (per §9) hardcodes Retriever's config key names.
- **Forge score generalization** — same hardcoded-key limitation, see §9.

None of these are broken — they're either dead code safe to delete or
finished backend work waiting on a UI that was descoped. Treat this list
as the honest diff between the original spec and what's live.

---

## 12. Build order — actual status

### Phase 1: Shell + theme + navigation — done
Design tokens, TopBar, ambient backgrounds, boot sequence, route-based
navigation (`RouteTransition.tsx`), Zustand store.

### Phase 2: Retriever campaign end-to-end — done
Story, Campaigns (map), Setup, Build (all sub-components), Ship, real
XP/mission flow with encouragement toasts.

### Phase 3: Real Lyzr integration — done
`backend/src/services/lyzr.ts` + `/api/agent/create`, `/api/agent/chat`.
Typewriter response reveal on Ship Day and in Chat. `LyzrNotConfiguredError`
surfaced as a 503 with a clear in-UI message when `LYZR_API_KEY` is unset.

### Phase 4: Documentation notebook + dedicated chat — done, simplified
Built as a single static notebook (§2) rather than a two-tab Agent Hub
with live edit mode. Concept cards, code sections, and the chat screen are
real; Study/Edit toggling and inline re-forge are not (§11).

### Phase 5: Mentor ("Nova") — done
Slide-out panel, real Lyzr-backed chat, context injected per mission,
`mentors_favorite` achievement wired.

### Phase 6: Gamification polish — done
XP fly, level-up burst, confetti, badge shelf, real achievements and
streak (§9), agent card flip reveal (§8), mission encouragement copy (§9).

### Phase 7: Additional campaigns — partial
Two live campaigns (Retriever Agent, Tool-Using Agent) instead of the
original five. Web Research Agent, Site Concierge, and Agent Crew were
never built.

### Phase 8: Landing + competitive + polish — descoped
No landing page (redirect instead, see §11), no leaderboard (§11).
Accessibility (`prefers-reduced-motion`) and responsive layout are in
place across shipped screens.

---

## 13. Campaigns (`frontend/lib/campaigns.ts`, `CAMPAIGN_IDS`)

Two campaigns exist, both fully populated `Campaign` objects:

### Retriever Agent (`id: "retriever"`, unlocked by default)
```
Story: Meridian Labs support team drowning in tickets
Mission 1 "Give the agent a mind": model, instruction, temperature
Mission 2 "Give it Meridian's memory": collection name, top_k
Inspector sections: Model & Reasoning | Instructions |
                     Knowledge Configuration | Tuning
```

### Tool-Using Agent (`id: "tool-agent"`, unlocks after shipping Retriever)
```
Story: Ops team running manual API calls per deploy
Mission 1 "Register the tools": tool name, description, credential
Mission 2 "Wire the decision layer": model, routing instruction, fallback
Inspector sections: Model & Reasoning | Instructions |
                     Tool Integration | Tuning
```

`Campaign.unlockAfter` drives the unlock chain; the backend mirrors it in
`progress.ts`'s `UNLOCK_MAP` (kept in sync manually — no shared module,
since the backend can't import the frontend's data file).

---

## 14. Backend Express server

```typescript
// backend/src/index.ts
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/agent', agentRoutes);      // create, chat
app.use('/api/agents', agentsRoutes);    // list, get, put .../config
app.use('/api/progress', progressRoutes);
app.use('/api/mentor', mentorRoutes);

app.listen(process.env.PORT || 4000);
```

### SQLite schema (`backend/src/db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  xp INTEGER DEFAULT 0,
  rank TEXT DEFAULT 'Recruit',
  streak INTEGER DEFAULT 0,
  last_forge_date TEXT,
  completed_missions TEXT DEFAULT '[]',
  unlocked_campaigns TEXT DEFAULT '["retriever"]',
  mentor_questions_asked INTEGER DEFAULT 0,
  chat_queries_run INTEGER DEFAULT 0,
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
```

---

## 15. Environment variables

```env
# backend/.env
LYZR_API_KEY=...
LYZR_MENTOR_AGENT_ID=...
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_PATH=./data/agentforge.db

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

If `LYZR_API_KEY` isn't set, Lyzr-backed routes throw `LyzrConfigError` and
respond `503` — the frontend catches this specifically (`LyzrNotConfiguredError`
in `lib/api.ts`) and shows an in-UI banner rather than a generic error.

---

## 16. Quick-start

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && npm install && npx nodemon src/index.ts

# Or both, from repo root, if a root package.json with concurrently exists
npm run dev
```
