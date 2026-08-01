# ForgeFlow — HiDevs Internship Evaluation Task

> Product name is **ForgeFlow** (renamed from "Agent Forge"). The
> reference file `agent-forge-reference.html` and some internal
> identifiers (CSS classes, component names) still use the old name —
> that's just legacy naming, not a re-brand to reverse.

## What this is
Gamified + educational platform for building real AI agents.
Two core experiences:
1. **Guided Build** — linear missions teaching the 5 pillars
2. **Documentation Notebook** — scrollable study guide + editable sandbox

After completing a campaign, its card on `/campaigns` swaps in two
actions for the shipped agent:
- Talk to Agent: chat with the agent they built
- View: comprehensive study guide + edit & re-forge configs

## Architecture
- Entry: '/' redirects to '/story/retriever' (no standalone landing page)
- Flow: Story → Campaigns (home: hero + campaign grid, doubles as the
  post-completion hub) → Setup → Build → Ship
- Post-completion: the campaign card itself (on /campaigns) shows two
  actions for a shipped agent — View (→ /agent/[agentId]/doc) and Talk
  to Agent (→ /agent/[agentId]/chat). There is no separate Lab grid and
  no Leaderboard screen in the current build.
- /agent/[agentId]/doc: scrollable documentation notebook (Study/Edit
  mode, Blueprint, Code Structure section, pillar sections, Test
  Console, Save & Re-forge)
- /agent/[agentId]/chat: dedicated chat UI for talking to the shipped
  agent

## Design tokens
Colors: void #07070c, panel #101018, violet #8b5cf6, plasma #22d3ee, spring #34d399
Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (code)

## Conventions
- Components organized by domain in /components
- Campaigns/missions are pure data in lib/campaigns.ts
- All animation via Framer Motion
- Respect prefers-reduced-motion
- TypeScript strict mode throughout
- Tailwind utilities preferred

## Reference files (read as needed, not loaded every turn)
- `AGENT_FORGE_DOCS.md` — full technical spec: architecture, all 9 screens,
  5 educational pillars, Lyzr API integration details, backend routes,
  design tokens, animation catalog, gamification system, Zustand store
  shape, 5 campaign data structures, SQLite schema, build phase order.
  Note: its screen-flow section predates the Story→Campaigns merge and
  the agentChat/agentDoc split above — this file's Architecture section
  is the current source of truth for navigation.
- `agent-forge-reference.html` — visual prototype and routing source of
  truth. Its `go()` router names the actual screen set: s-story,
  s-launch, s-setup, s-build, s-done, s-learn, s-agentchat. Source of
  truth for exact colors, fonts, spacing, and animation timing/easing.

## Build order (see AGENT_FORGE_DOCS.md §11 for full checklist per phase)
1. Shell + theme + navigation
2. Retriever campaign end-to-end (guided flow)
3. Real Lyzr API integration
4. Agent documentation notebook + dedicated chat screen (the key
   differentiator feature)
5. Mentor ("Nova") agent
6. Gamification polish
7. Additional campaigns (2–5)
8. Landing + competitive + polish
