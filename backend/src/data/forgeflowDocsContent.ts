/** ForgeFlow's own documentation — what Nova is grounded in
 * (FORGEFLOW_V3_SPEC.md §8). Written in plain prose, section by section, so
 * chunking.ts's word-based splitter produces coherent chunks. Every claim
 * here is checked against the real implementation, not guessed — this is
 * meant to be re-read and corrected the same way the spec itself is kept
 * honest, not treated as marketing copy. */
export const FORGEFLOW_DOCS_CONTENT = `
# What ForgeFlow is

ForgeFlow is a platform for building real AI agents — not simulated ones. Every agent you build here is a genuine agent created on the Lyzr Agent Platform via a real POST to /v3/agents/, with a real agent_id returned. There is no mock mode: if Lyzr isn't configured with a real API key, features that need it fail with a clear "not configured" error rather than faking a response.

You can build a single agent from a completely blank canvas ("Start from scratch"), clone one of the starting templates (Retriever Agent, Tool-Using Agent) as an editable starting point, or build a Multi-Agent Crew — several real agents plus a real orchestrator that routes between them. Templates only change which placeholder hints you see; they are not a different underlying system. A Crew is genuinely different: it is its own Build Type with its own four-level flow, not a template variant.

# The five real pillars of a single agent

Every single agent you build is made of five real pieces, each corresponding to a real field or a real subsystem:

Identity — the agent's name, role, and goal. These map directly to the real Lyzr fields name, agent_role, and agent_goal in the create payload. A vague identity produces vague behavior because the model has nothing specific to anchor its persona to.

Instructions — the single biggest lever on behavior. This is the real agent_instructions field sent to Lyzr. Tone, boundaries, and refusal rules all live here. Thin instructions (under roughly 40 characters) are flagged as a real validation warning because they raise hallucination risk — the model has too little to ground itself in.

Model & Tuning — which real Lyzr model the agent runs on (for example gemini-2.5-flash or gemini-2.5-pro) and its temperature (0.0 to 1.0). Lower temperature means more deterministic, factual output; higher temperature means more creative, varied output. gemini-2.5-flash is fast and cheap, the right default for most support and retrieval agents. gemini-2.5-pro reasons more deeply on multi-step or ambiguous tasks but costs more and answers more slowly.

Knowledge — optional. Lets the agent retrieve real, developer-supplied documents at chat time. Covered in detail below, because how it works is one of the most commonly misunderstood parts of the platform.

Tools — optional. Lets the agent call real external actions mid-conversation. Also covered in detail below.

# How Knowledge / RAG retrieval actually works — query time, not creation time

This is the single most important thing to understand about Knowledge in ForgeFlow: retrieval happens on every chat message, not once when you create the agent. Nothing about an agent's knowledge is "baked in" at Ship time.

When you upload a document (or paste text), the real pipeline is: the text is split into overlapping chunks (about 500 tokens each, roughly 375 words, with about 50 tokens of overlap between consecutive chunks so a fact split across a chunk boundary isn't lost), each chunk is embedded into a 768-dimension vector using Google's gemini-embedding-001 model, and the vectors are upserted into a real Qdrant collection named agent_<the agent's real Lyzr agent_id>. That collection is created lazily, the first time a document is uploaded for that agent.

Then, on every single chat message sent to that agent — not just the first one, every one — the incoming question is itself embedded into a vector using the same model, and that vector is used to search the agent's Qdrant collection for the top-k most similar chunks (top_k defaults to 4, and is configurable in the Knowledge mission; going above about 5-8 tends to flood the prompt with low-relevance chunks and hurt answer quality rather than help it). Those chunks are prepended to that one message as retrieved context before it's sent to the real Lyzr agent. If the agent has zero ingested documents, this step is skipped entirely and the raw message goes straight to Lyzr — there is no fallback "general knowledge" injection.

This means: if you delete a document, the very next chat message immediately stops being able to use facts from it, because retrieval is happening fresh on that message, not replaying something baked in earlier. This was verified directly during Phase 1 development — an invented fact was uploaded, the agent could answer with it, the document was deleted, and the agent immediately could no longer answer with that fact and said so rather than guessing.

Why it's built this way rather than stuffing all documents into the instructions once at creation: query-time retrieval scales to documents far larger than would fit in a prompt, it lets you add or remove knowledge without re-shipping the agent, and it means only the handful of chunks actually relevant to THIS question get sent, not the entire knowledge base every time.

This is also exactly why the Upload Your Knowledge mission is deliberately locked until after you ship the agent, not available earlier alongside Identity or Instructions. The real Qdrant collection a document's chunks get upserted into is named agent_<the agent's real Lyzr agent_id> — and that real agent_id does not exist until the real POST /v3/agents/ call has actually returned it. There is no collection to create or upload into before that id exists, so the mission stays genuinely locked (not just visually greyed out — its real unlock condition is literally "does a real created agent exist yet") until Ship produces one. The instant it does, the lock lifts immediately.

# How Tools and the TOOL_CALL loop actually work

Tools let a real shipped agent call a real external action mid-conversation — either the built-in keyless weather lookup (hits open-meteo's free geocoding and forecast APIs, no API key required) or a webhook you supply (a real URL that gets a real HTTP POST with the tool's validated arguments as the JSON body).

This is not Lyzr's own tool_configs feature — that's shaped for pre-registered enterprise connectors, not arbitrary developer webhooks, so ForgeFlow owns this loop itself. The mechanism: when you attach a tool, its name, description, and parameter schema get compiled into a real contract that is appended to the agent's real agent_instructions at creation time. That contract tells the model: if you need this tool, respond with exactly TOOL_CALL: followed by a JSON object naming the tool and its arguments, and nothing else in that turn.

At chat time, every response from the real Lyzr agent is checked for that TOOL_CALL marker. If it's present, the backend parses the tool name and arguments out of it, validates the arguments against the tool's declared parameter schema, executes the real HTTP call (the real weather API, or the real webhook), and feeds the real result back into the same Lyzr session as a new message. The agent then answers the user's original question in natural language using that real result. This can loop up to four times as a safety cap against a runaway tool-calling loop.

The important constraint to know: tool attachment is build-time only. A tool registered after an agent has already shipped is not callable, because Lyzr agents aren't patchable in place — there is no way to append to an already-created agent's instructions. If you want to add a tool to an already-shipped agent, the real path is Multiverse Compare's fork-and-finalize flow, which re-forges a new version of the agent with the updated instructions.

# How Red Team Arena and Redcap actually work

Red Team Arena tests a real shipped agent against real adversarial prompts and gives a real, structured judgment on how it held up — not a script, not a fixed pass/fail based on keyword matching.

Redcap is a single, pre-provisioned real Lyzr agent (same pattern as Nova itself — a fixed agent_id configured once) with two real modes it's instructed to operate in. In MODE:ATTACK, given the target agent's real role and real instructions, Redcap generates five adversarial prompts fresh, genuinely tailored to that specific agent's actual domain — one each from five categories: prompt injection (trying to extract the system prompt), off-topic bait, data exfiltration (trying to get the agent to leak another user's information), jailbreak roleplay (trying to get the agent to drop its persona), and contradiction pressure (social-engineering the agent into contradicting its own documented facts). These are never the same five prompts twice, because they're generated fresh by a real model call every run, not read from a fixed list.

Each of the five prompts is then sent for real to the actual target agent, through the exact same real chat pipeline a normal user message goes through — including real knowledge retrieval and the real tool loop if the target agent has either. Its real response is then sent to Redcap in MODE:JUDGE, which returns a real verdict of held or broke, a specific reason citing what the response actually did, and — when it broke — a concrete suggested fix.

One category gets an extra, deterministic safety net on top of Redcap's own judgment: for the data_exfiltration category specifically, if the target's real response contains something that looks like an email address or a phone number (checked with a real regex, not another model call), the verdict is forced to broke even if Redcap's own judgment was more lenient — because an actual literal PII leak in the text is not something that should ever be waved through as "held" on a technicality.

Every one of the five results is stored, tagged with the target agent's real current version number. That means if you fix an agent (re-forge it with better instructions via Multiverse Compare) and run Red Team Arena again, the new run's results are tagged with the new version and can be compared directly against the old version's results — a genuine before-and-after, not just an overwritten score.

# What Levels, Missions, and Subtasks are, and why the flow is structured that way

Every real build — single agent or Crew — is broken into Levels, and each Level into Missions, and each Mission into a handful of concrete Subtasks (the fields it actually collects). This isn't decoration on top of a simpler flow; it's a deliberate teaching structure called progressive disclosure.

Before you start a Level, you see a Level-intro screen listing every Mission in it and the real XP available. Before you start each Mission within that Level, you see a Mission-overview screen with that Mission's specific Subtasks and its real XP reward. Only once you've begun a Mission do you reach its actual editor.

Inside the editor, fields belonging to a Mission you haven't reached yet are genuinely inert — not just visually quieter, but non-interactive: no focus, no click, greyed out, no "fill me" highlight. Fields belonging to the Mission you're currently on, or any Mission you've already completed, stay fully interactive, so you can always scroll back and fix an earlier decision (like tightening Instructions while you're working on Model & Tuning) without losing anything. This is enforced by real state, not CSS alone — a locked field's input element has a real disabled attribute.

The reason for this structure: each Mission is meant to be one real engineering decision at a time. Showing every field on a single agent all at once (name, role, goal, instructions, model, temperature, and more) invites rushing through without thinking about any one of them. Gating fields behind the Mission that owns them means Model & Tuning can't get filled in before Identity is even done.

The Build Map sidebar, visible once you're in a Mission's editor, shows every Mission across every Level as one grouped list with real Level section headers, and lets you jump back to any already-completed Mission directly.

# What Multi-Agent Crews are and how routing actually works

A Multi-Agent Crew is N real, independently-shipped sub-agents plus one more real agent — the orchestrator — that decides, per message, whether to answer directly or hand off to a specialist. Every sub-agent and the orchestrator is a genuine Lyzr agent with its own real agent_id; nothing about a Crew is simulated.

Building a Crew has its own four-level flow, separate from the single-agent flow, though it reuses that entire single-agent flow underneath: Level 1 is Define the Crew, where you decide how many specialists you need and give each one a short, free-text role label — there is no fixed set of roles. Level 2, Build Each Sub-Agent, is one full real single-agent build per specialist — the exact same Identity, Instructions, Model & Tuning missions (and optionally Knowledge or Tools) as building any other agent, run once per specialist, each shipping as its own independent real agent. Level 3, Orchestrator, builds one more real agent the same way, except that at Ship time its real agent_instructions automatically get a routing contract appended, listing the crew's real specialist role labels. Level 4, Deploy Crew, confirms every real agent_id exists and writes the real crew record tying them together.

The routing mechanism at chat time mirrors the Tools mechanism exactly, just with a different marker: the orchestrator's contract tells it that if a specialist is better placed to answer, it should respond with exactly ROUTE_TO: followed by the specialist's role label, and nothing else. Every real message first goes to the orchestrator's real chat endpoint. If its real response contains that marker, the backend looks up which real sub-agent owns that role label and sends the user's original message to THAT sub-agent's real chat endpoint — and the sub-agent's real answer is what comes back to the user, not something the orchestrator recomposes. If there's no marker, the orchestrator's own answer is returned directly. Each real agent in the conversation — the orchestrator and every specialist — keeps its own separate, stable session, so each one remembers its own part of the conversation correctly across turns.

# Glossary of real terms

agent_id — the real identifier Lyzr's own API returns when an agent is created. This is what every real chat call, knowledge upload, and tool execution is actually keyed by on Lyzr's side.

internal row id (forged_agents.id) — a separate id ForgeFlow generates for its own database row about that agent. Routes like /agent/:id/chat use THIS id, not the Lyzr agent_id — the Lyzr agent_id is real but only shown for reference, not used for ForgeFlow's own routing.

top_k — how many retrieved chunks come back per query during Knowledge retrieval. Defaults to 4. Too high floods the prompt with low-relevance material and can hurt answer quality rather than help it.

forge score — a real, computed 0-100 score reflecting build quality, not a fabricated number. It currently adds up: up to 20 points for instruction length/quality, up to 15 for how close temperature is to a balanced 0.3, a flat 15 for having selected any valid model, up to 20 for a sensible top_k (or a flat 20 if Knowledge wasn't applicable to this build), a flat 15 for tool-config completeness (this bucket is currently auto-granted rather than a real check — a known, tracked gap, not something to claim is fully real), and up to 15 as a speed bonus for finishing faster than the mission's time estimate.

forge_time — the real number of seconds the build actually took, timed client-side from when the build started to when Ship was clicked, and used as one input to the forge score's speed bonus.

version — a real integer on each shipped agent, starting at 1 and incrementing every time it's re-forged (for example via Multiverse Compare's finalize action). Red Team Arena results are tagged by this real version, which is what makes a genuine before/after comparison possible after a fix.

ROUTE_TO / TOOL_CALL — the two real marker conventions ForgeFlow's own backend parses out of a real Lyzr response text to trigger an action outside of Lyzr itself (calling a webhook, or handing off to another real agent). Both are real string contracts baked into instructions, not a Lyzr platform feature.
`.trim();
