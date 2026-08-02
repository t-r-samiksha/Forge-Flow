import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { chatWithMentorAgent, LyzrConfigError } from "../services/lyzr";
import { db } from "../db";
import { awardAchievement } from "../services/achievements";
import { chunkText } from "../services/chunking";
import { embedText, embedTexts, EmbeddingConfigError } from "../services/embeddings";
import {
  ensureForgeflowDocsCollection,
  upsertForgeflowDocsChunks,
  searchForgeflowDocs,
  deleteForgeflowDocsCollection,
  QdrantConfigError,
} from "../services/qdrant";
import { FORGEFLOW_DOCS_CONTENT } from "../data/forgeflowDocsContent";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { ownsForgedAgentId } from "../services/ownership";

const router = Router();
router.use(requireAuth);

/** Internal/admin seed endpoint (FORGEFLOW_V3_SPEC.md §8/§9) — chunks and
 * embeds ForgeFlow's own documentation and upserts it into the real
 * forgeflow_docs Qdrant collection, using the exact same real pipeline
 * (chunking.ts/embeddings.ts/qdrant.ts) Phase 1 built for per-agent
 * knowledge. Deletes and recreates the collection first so re-running
 * this (e.g. after editing the docs content) doesn't leave stale
 * duplicate chunks behind — meant to be run once per real content change,
 * not per request. Gated by requireAuth (any real signed-in caller, no
 * anonymous access) — there's no admin/role concept anywhere in this app
 * yet to restrict it further than that; a real per-role gate is a
 * separate, out-of-scope concern from §36's real-auth migration. */
router.post("/ingest-docs", async (req: Request, res: Response) => {
  try {
    const chunks = chunkText(FORGEFLOW_DOCS_CONTENT, 400, 40);
    if (chunks.length === 0) {
      return res.status(400).json({ error: "FORGEFLOW_DOCS_CONTENT produced no chunks" });
    }

    console.log(`[mentor] ingest-docs: ${FORGEFLOW_DOCS_CONTENT.length} chars -> ${chunks.length} chunks`);

    await deleteForgeflowDocsCollection();
    await ensureForgeflowDocsCollection();

    const vectors = await embedTexts(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${vectors.length} vectors for ${chunks.length} chunks`);
    }

    const docId = uuidv4();
    await upsertForgeflowDocsChunks(
      chunks.map((chunk, i) => ({
        vector: vectors[i]!,
        text: chunk.text,
        docId,
        filename: "forgeflow_docs.md",
        chunkIndex: chunk.index,
      }))
    );

    return res.json({ ingested: true, chunkCount: chunks.length, charCount: FORGEFLOW_DOCS_CONTENT.length });
  } catch (err) {
    if (err instanceof EmbeddingConfigError || err instanceof QdrantConfigError) {
      return res.status(503).json({ error: err.message, code: "KNOWLEDGE_NOT_CONFIGURED" });
    }
    console.error("[mentor] ingest-docs failed", err);
    return res.status(502).json({ error: "Failed to ingest ForgeFlow docs" });
  }
});

/** Real per-query retrieval against forgeflow_docs — same pattern as
 * agent.ts's withRetrievedContext for user-agent knowledge (§5/§11):
 * embed the live question, search, prepend the real chunks to THIS
 * message only. Never baked in once. Falls back to the raw message on
 * any retrieval failure, same as the per-agent version — a grounding
 * outage shouldn't take down Nova entirely. */
async function withForgeflowDocsContext(message: string): Promise<string> {
  try {
    const queryVector = await embedText(message);
    const chunks = await searchForgeflowDocs(queryVector, 5);
    if (chunks.length === 0) return message;

    console.log(
      `[mentor] retrieved ${chunks.length} forgeflow_docs chunk(s): ` +
        chunks.map((c) => `#${c.chunkIndex} (score=${c.score.toFixed(3)})`).join(", ")
    );

    const context = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
    return `Use the following ForgeFlow documentation to answer the question. If it doesn't contain the answer, say so instead of guessing.\n\nDocumentation:\n${context}\n\nQuestion: ${message}`;
  } catch (err) {
    console.error("[mentor] forgeflow_docs retrieval failed, falling back to raw message", err);
    return message;
  }
}

interface ForgedAgentRow {
  id: string;
  name: string;
  forge_score: number;
  lyzr_payload: string | null;
}

/** Contextual grounding stack, layer two (§8): when this turn is asked
 * from a specific agent's real Doc page, inject that agent's real config
 * and real forge score on top of the platform-doc grounding above — so
 * e.g. "why is my forge score low" is answered from both ForgeFlow's real
 * scoring logic AND this agent's real current score, not generic advice. */
function withAgentContext(message: string, agentId: string | undefined): string {
  if (!agentId) return message;
  const row = db.prepare("SELECT id, name, forge_score, lyzr_payload FROM forged_agents WHERE id = ?").get(
    agentId
  ) as ForgedAgentRow | undefined;
  if (!row) return message;

  const payload = JSON.parse(row.lyzr_payload || "{}") as Record<string, unknown>;
  const agentInfo =
    `Real config for the specific agent this question is about — "${row.name}": ` +
    `role="${payload.agent_role ?? ""}", model="${payload.model ?? ""}", ` +
    `temperature=${payload.temperature ?? ""}, forge_score=${row.forge_score}/100, ` +
    `instructions="${String(payload.agent_instructions ?? "").slice(0, 400)}".`;

  return `${agentInfo}\n\n${message}`;
}

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { message, context, sessionId, agentId } = (req.body ?? {}) as {
      message?: string;
      context?: string;
      sessionId?: string;
      agentId?: string;
    };
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    // Real ownership gate (§36) — agentId is optional (Nova works fine
    // platform-wide with none), but if this question was asked from a
    // specific agent's Doc page, that agent must actually belong to the
    // caller — otherwise anyone could pull any agent's real config/forge
    // score into a Nova answer just by supplying its id.
    if (agentId && !ownsForgedAgentId(userId, agentId)) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const docsGrounded = await withForgeflowDocsContext(message);
    const fullyGrounded = withAgentContext(docsGrounded, agentId);
    const prompt = context ? `Context: ${context}. Question: ${fullyGrounded}` : fullyGrounded;
    const resolvedSessionId = sessionId || uuidv4();

    const { response } = await chatWithMentorAgent(prompt, userId, resolvedSessionId);

    const newAchievements: string[] = [];
    db.prepare(`INSERT OR IGNORE INTO users (id, last_forge_date) VALUES (?, ?)`).run(
      userId,
      new Date().toISOString().slice(0, 10)
    );
    db.prepare(
      "UPDATE users SET mentor_questions_asked = COALESCE(mentor_questions_asked, 0) + 1 WHERE id = ?"
    ).run(userId);
    const row = db.prepare("SELECT mentor_questions_asked FROM users WHERE id = ?").get(userId) as
      | { mentor_questions_asked: number }
      | undefined;
    if ((row?.mentor_questions_asked ?? 0) >= 10 && awardAchievement(userId, "mentors_favorite")) {
      newAchievements.push("mentors_favorite");
    }

    return res.json({ response, newAchievements });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to reach Nova" });
  }
});

export default router;
