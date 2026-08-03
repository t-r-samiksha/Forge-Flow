# ForgeFlow

A gamified platform for building **real AI agents** — no simulated calls, no mock data. Every mission wires directly into a genuine backend call: a real Lyzr agent gets created, real documents get chunked/embedded/stored in a real vector database, real tools get registered and invoked, real red-team attacks run against your actual agent.

Pick a starting point — a blank canvas, a Retriever Agent (RAG over your own docs), a Tool-Using Agent (real webhook/tool calling), or a multi-agent Crew (real orchestrator + sub-agents) — and ship it one real engineering decision at a time.

## What's real, concretely

- **Agent creation** — a real `POST` to the Lyzr Agent Platform (`agent-prod.studio.lyzr.ai`), returning a real `agent_id`.
- **Knowledge / RAG** — uploaded documents are chunked, embedded via Google's `gemini-embedding-001`, and stored per-agent in Qdrant; every chat query does a real vector search and injects the real retrieved chunks — not stuffed into the prompt once at creation time.
- **Tool calling** — a real `TOOL_CALL` marker contract is baked into the agent's instructions; the backend intercepts it, makes a real HTTP call to the registered endpoint (or a real built-in weather lookup), and feeds the real result back into the conversation.
- **Multi-Agent Crews** — a real orchestrator agent routes to real, independently-shipped sub-agents via a `ROUTE_TO` contract, each a genuine Lyzr agent in its own right.
- **Red Team Arena** — a dedicated judge agent ("Redcap") generates real adversarial prompts tailored to your agent's actual role and instructions, then judges whether your agent held its ground.
- **Auth** — real Supabase magic-link email sign-in. No passwords, no client-side fake identities; every protected backend route verifies a real JWT and enforces real per-user ownership checks.

## Stack

```
Browser
  |
  |--> Supabase Auth (real magic-link email, real JWT sessions)
  |
  v
Next.js 14 frontend (App Router)
  |
  v
Express backend
  |
  |--> SQLite (better-sqlite3)          -- app state, agent config, history
  |--> Qdrant Cloud                      -- per-agent + platform-doc vector storage
  |--> Google Gemini embeddings API      -- gemini-embedding-001
  +--> Lyzr Agent Platform               -- the actual LLM agent runtime
```

Supabase is used purely as the identity provider (magic-link delivery + session verification) — all app data lives in the backend's own SQLite database, not Supabase's Postgres.

## Project structure

```
frontend/    Next.js 14 (App Router), TypeScript, Tailwind
  app/         routes: campaigns, build, ship, agent/[id]/*, crew, sign-in, auth/callback, leaderboard
  components/  screens, build UI (code panel, mission rail, blueprint), auth
  lib/         api client, session/auth state, campaign + mission data, Supabase client

backend/     Express, TypeScript, better-sqlite3
  src/routes/     agent, agents, crew, knowledge, tools, redteam, mentor, progress, leaderboard, auth
  src/services/    Lyzr client, Qdrant, embeddings, chunking, ownership checks, Supabase admin
  src/middleware/  requireAuth (real JWT verification on every protected route)
  src/db/          schema.sql + migration guards
```

## Local development

Requires Node 18+.

```bash
npm install --prefix frontend
npm install --prefix backend
```

Copy the env templates and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Run both together from the repo root:

```bash
npm run dev
```

Or separately: `npm run dev --prefix backend` (port 4000) and `npm run dev --prefix frontend` (port 3000).

### Environment variables

**Backend** (`backend/.env`):

| Variable | Purpose |
|---|---|
| `LYZR_API_KEY`, `LYZR_MENTOR_AGENT_ID`, `LYZR_REDCAP_AGENT_ID` | Lyzr Agent Platform access + the two platform-provisioned assistant agents |
| `QDRANT_URL`, `QDRANT_API_KEY` | Vector storage |
| `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY` | Google Gemini embeddings |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Auth verification (secret key — backend only, never expose) |
| `DATABASE_PATH` | SQLite file location |
| `FRONTEND_URL` | CORS allow-list — must match your deployed frontend's real origin |

**Frontend** (`frontend/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | The backend's URL |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public, RLS-scoped Supabase client config |

## Deployment

**Frontend → Vercel.** Standard Next.js deploy, no special config. Set the three `NEXT_PUBLIC_*` variables in the Vercel dashboard and redeploy after changing them (they're baked in at build time).

**Backend → Railway or Render** (not Vercel — see below). `npm run build` compiles to `dist/`; `npm run start` runs it. A `render.yaml` blueprint is included for Render.

> **Critical:** the backend uses a local SQLite file for real persisted data (agents, users, progress). This **requires a persistent disk/volume** on whichever host you use — without one, every redeploy silently wipes the database back to empty. On Render, this is `render.yaml`'s `disk` block. On Railway, attach a **Volume** under the service's Settings and point `DATABASE_PATH` at a path inside its mount, e.g. `/data/agentforge.db`.

Two more things that need doing manually once you have real URLs:
- Add your production frontend URL to Supabase's **Auth → URL Configuration → Redirect URLs** allow-list, or magic-link sign-in will fail in production.
- Set `FRONTEND_URL` (backend) to your frontend's real HTTPS origin — CORS matching is exact, including scheme.

Why not Vercel for the backend: Vercel's serverless functions have an ephemeral, per-invocation filesystem — a local SQLite file's writes won't durably persist there.

## Scripts

| Command | Where | What |
|---|---|---|
| `npm run dev` | root | Runs frontend + backend together |
| `npm run dev` | `frontend/` | Next.js dev server |
| `npm run build` / `npm run start` | `frontend/` | Production build / serve |
| `npm run dev` | `backend/` | Express with hot reload (`ts-node-dev`) |
| `npm run build` / `npm run start` | `backend/` | Compiles to `dist/` / runs the compiled server |
