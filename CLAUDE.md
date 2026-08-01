# ForgeFlow — Claude Code Context

Before making any changes, read **FORGEFLOW_V3_SPEC.md** in this repo root. It is the
single source of truth for this project — treat it as ground truth over any assumption,
prior training knowledge, or leftover code comments that suggest otherwise.

## What the spec doc contains

- **"Build status" table** near the top — the real, current state of every feature:
  what's genuinely implemented and smoke-tested (✅), in progress (🔨), spec'd but not
  built (⏳), or still mock/hardcoded. This table is updated after every real change —
  check it before assuming something exists or doesn't.
- Full architecture, API endpoints, DB schema, and env vars actually in use.
- Numbered sections (§1–§16+) covering how agent creation, RAG retrieval, tool execution,
  red teaming, crews, and Nova are meant to work — and how they currently work, where
  those differ.

## Hard rules for this codebase

1. **Nothing is hardcoded or simulated.** No fake company data, no mock API responses,
   no cosmetic config fields that look real but aren't wired to anything. If a field is
   shown in the UI, it must actually reach and affect the real backend call it implies.

2. **§5b — code panels must be accurate.** Any code shown in the Build UI (the
   fill-in-the-blank editor, live blueprint, etc.) must structurally match what the
   real backend actually does — not a simplified or fictional version for teaching
   purposes. If the real flow is two separate operations (e.g. agent creation vs.
   per-message retrieval), the UI must show two separate representations, not one
   collapsed fictional call. Locked/unopenable tabs implying hidden real code are not
   allowed — if a tab is shown, it must be real and inspectable.

3. **Don't re-implement what's already done.** Check the Build status table first.
   If something is marked ✅ Done, extend or fix it — don't rebuild it from scratch,
   and flag clearly if something marked ✅ appears broken rather than silently
   reworking it.

4. **Freeform first.** This is a platform for developers to build *any* agent they
   want — new features (tools, red team, crews) should work against arbitrary
   developer-defined agents, not be bolted onto fixed campaign/template data.

5. **Verify with real calls, not just "it compiles."** Every phase so far has been
   confirmed with actual end-to-end testing against the real Lyzr API, real Qdrant
   cluster, and real embeddings — including negative controls where relevant (e.g.
   proving retrieval is doc-gated by testing an agent with no docs attached). Follow
   this pattern for new work: real smoke tests with real logs, not assumptions.

## After making changes

Update the relevant section(s) of FORGEFLOW_V3_SPEC.md yourself if you have write
access to it, or clearly report in your summary: what was built, what was verified
(with real test details, not "it works"), and any deviations from the spec discovered
along the way (e.g. an API field name that didn't match documentation, a retired model,
a platform constraint) — these get folded back into the spec as corrections, the same
way earlier phases already have.