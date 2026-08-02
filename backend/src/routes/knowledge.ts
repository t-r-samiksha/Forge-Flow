import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { chunkText } from "../services/chunking";
import { embedTexts, EmbeddingConfigError } from "../services/embeddings";
import { upsertChunks, deleteDocChunks, QdrantConfigError } from "../services/qdrant";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { ownsLyzrAgent } from "../services/ownership";

const router = Router();
router.use(requireAuth);

interface KnowledgeDocRow {
  id: string;
  agent_id: string;
  filename: string;
  chunk_count: number;
  char_count: number;
  uploaded_at: string;
}

function rowToDoc(row: KnowledgeDocRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    filename: row.filename,
    chunkCount: row.chunk_count,
    charCount: row.char_count,
    uploadedAt: row.uploaded_at,
  };
}

/** Text-only upload for phase 1 — body is JSON { filename, content }
 * rather than multipart, so no extra upload-parsing dependency is needed. */
router.post("/upload/:agentId", async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { agentId } = req.params as { agentId: string };
    // Real ownership gate (§36) — this table had no userId concept at all
    // before; agentId alone used to be enough to upload documents into any
    // agent's vector store, owned or not.
    if (!ownsLyzrAgent(userId, agentId)) {
      return res.status(404).json({ error: "Agent not found" });
    }
    const { filename, content } = (req.body ?? {}) as { filename?: string; content?: string };
    if (!filename || !content || !content.trim()) {
      return res.status(400).json({ error: "filename and content are required" });
    }

    const chunks = chunkText(content);
    if (chunks.length === 0) {
      return res.status(400).json({ error: "content produced no chunks" });
    }

    console.log(
      `[knowledge] upload agentId=${agentId} filename="${filename}" chars=${content.length} chunks=${chunks.length}`
    );

    const vectors = await embedTexts(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${vectors.length} vectors for ${chunks.length} chunks`);
    }

    const docId = uuidv4();
    await upsertChunks(
      agentId,
      chunks.map((chunk, i) => ({
        // Non-null: length-checked against chunks.length above.
        vector: vectors[i]!,
        text: chunk.text,
        docId,
        filename,
        chunkIndex: chunk.index,
      }))
    );

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_docs (id, agent_id, user_id, filename, chunk_count, char_count, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(docId, agentId, userId, filename, chunks.length, content.length, now);

    return res.json({
      id: docId,
      agentId,
      filename,
      chunkCount: chunks.length,
      charCount: content.length,
      uploadedAt: now,
    });
  } catch (err) {
    if (err instanceof EmbeddingConfigError || err instanceof QdrantConfigError) {
      return res.status(503).json({ error: err.message, code: "KNOWLEDGE_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to ingest document" });
  }
});

router.get("/:agentId", (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  if (!ownsLyzrAgent(userId, String(req.params.agentId))) {
    return res.status(404).json({ error: "Agent not found" });
  }
  const rows = db
    .prepare("SELECT * FROM knowledge_docs WHERE agent_id = ? ORDER BY uploaded_at DESC")
    .all(req.params.agentId) as KnowledgeDocRow[];
  res.json(rows.map(rowToDoc));
});

router.delete("/:agentId/:docId", async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { agentId, docId } = req.params as { agentId: string; docId: string };
    if (!ownsLyzrAgent(userId, agentId)) {
      return res.status(404).json({ error: "Agent not found" });
    }
    const row = db
      .prepare("SELECT * FROM knowledge_docs WHERE agent_id = ? AND id = ?")
      .get(agentId, docId) as KnowledgeDocRow | undefined;
    if (!row) return res.status(404).json({ error: "Document not found" });

    await deleteDocChunks(agentId, docId);
    db.prepare("DELETE FROM knowledge_docs WHERE id = ?").run(docId);

    return res.json({ deleted: true, id: docId });
  } catch (err) {
    if (err instanceof QdrantConfigError) {
      return res.status(503).json({ error: err.message, code: "KNOWLEDGE_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to delete document" });
  }
});

export default router;
