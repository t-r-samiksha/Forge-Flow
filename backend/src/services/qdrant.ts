import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { EMBEDDING_DIM } from "./embeddings";

export class QdrantConfigError extends Error {}

function requireConfig(): { url: string; apiKey: string } {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url || !apiKey) {
    throw new QdrantConfigError(
      "QDRANT_URL / QDRANT_API_KEY are not configured — add real values to backend/.env"
    );
  }
  return { url, apiKey };
}

let client: QdrantClient | null = null;
function getClient(): QdrantClient {
  if (!client) {
    const { url, apiKey } = requireConfig();
    client = new QdrantClient({ url, apiKey, checkCompatibility: false });
  }
  return client;
}

/** Qdrant collection names must be safe identifiers — agent ids are
 * already URL-safe (Lyzr agent ids / uuids) but we sanitize defensively. */
export function collectionName(agentId: string): string {
  return `agent_${agentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Shared real implementation, parameterized on an already-resolved
 * collection name — collectionName(agentId) for per-agent knowledge,
 * or the fixed FORGEFLOW_DOCS_COLLECTION for Nova's own docs (§8). Every
 * agent-keyed export below is a thin wrapper over these, so there is
 * exactly one real ensure/upsert/search implementation, not two. */
async function ensureCollectionNamed(name: string): Promise<void> {
  const exists = await getClient().collectionExists(name);
  if (!exists.exists) {
    await getClient().createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
    });
  }
  // Idempotent — safe to call on every ensure, which also heals
  // collections created before this index was introduced. This cluster
  // runs with strict mode, which requires an index on any payload field
  // used in a filter — deleteDocChunks filters on docId.
  await getClient().createPayloadIndex(name, {
    field_name: "docId",
    field_schema: "keyword",
  });
}

export async function ensureCollection(agentId: string): Promise<void> {
  await ensureCollectionNamed(collectionName(agentId));
}

export interface ChunkToUpsert {
  id?: string;
  vector: number[];
  text: string;
  docId: string;
  filename: string;
  chunkIndex: number;
}

async function upsertChunksNamed(name: string, chunks: ChunkToUpsert[]): Promise<void> {
  if (chunks.length === 0) return;
  await ensureCollectionNamed(name);
  await getClient().upsert(name, {
    wait: true,
    points: chunks.map((chunk) => ({
      id: chunk.id ?? uuidv4(),
      vector: chunk.vector,
      payload: {
        text: chunk.text,
        docId: chunk.docId,
        filename: chunk.filename,
        chunkIndex: chunk.chunkIndex,
      },
    })),
  });
}

export async function upsertChunks(agentId: string, chunks: ChunkToUpsert[]): Promise<void> {
  await upsertChunksNamed(collectionName(agentId), chunks);
}

export interface SearchResultChunk {
  text: string;
  docId: string;
  filename: string;
  chunkIndex: number;
  score: number;
}

async function searchNamed(name: string, queryVector: number[], topK = 5): Promise<SearchResultChunk[]> {
  const exists = await getClient().collectionExists(name);
  if (!exists.exists) return [];

  const results = await getClient().search(name, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });

  return results.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    return {
      text: String(payload.text ?? ""),
      docId: String(payload.docId ?? ""),
      filename: String(payload.filename ?? ""),
      chunkIndex: Number(payload.chunkIndex ?? 0),
      score: r.score,
    };
  });
}

export async function search(
  agentId: string,
  queryVector: number[],
  topK = 5
): Promise<SearchResultChunk[]> {
  return searchNamed(collectionName(agentId), queryVector, topK);
}

/** Nova's own platform-doc collection (FORGEFLOW_V3_SPEC.md §8) — a fixed
 * name instead of agent_<id>, real pipeline reused as-is via the *Named
 * helpers above. Exported as a function (not a bare constant used
 * directly by callers) so a negative-control test can point at a
 * different/nonexistent name without touching real seeded data — see
 * NOVA_DOCS_COLLECTION_OVERRIDE below. */
const FORGEFLOW_DOCS_COLLECTION = "forgeflow_docs";
function forgeflowDocsCollectionName(): string {
  return process.env.NOVA_DOCS_COLLECTION_OVERRIDE || FORGEFLOW_DOCS_COLLECTION;
}

export async function ensureForgeflowDocsCollection(): Promise<void> {
  await ensureCollectionNamed(forgeflowDocsCollectionName());
}

export async function upsertForgeflowDocsChunks(chunks: ChunkToUpsert[]): Promise<void> {
  await upsertChunksNamed(forgeflowDocsCollectionName(), chunks);
}

export async function searchForgeflowDocs(queryVector: number[], topK = 5): Promise<SearchResultChunk[]> {
  return searchNamed(forgeflowDocsCollectionName(), queryVector, topK);
}

export async function deleteForgeflowDocsCollection(): Promise<void> {
  const name = forgeflowDocsCollectionName();
  const exists = await getClient().collectionExists(name);
  if (exists.exists) await getClient().deleteCollection(name);
}

export async function deleteDocChunks(agentId: string, docId: string): Promise<void> {
  const name = collectionName(agentId);
  const exists = await getClient().collectionExists(name);
  if (!exists.exists) return;
  await ensureCollection(agentId);
  await getClient().delete(name, {
    wait: true,
    filter: { must: [{ key: "docId", match: { value: docId } }] },
  });
}

export async function deleteCollection(agentId: string): Promise<void> {
  const name = collectionName(agentId);
  const exists = await getClient().collectionExists(name);
  if (exists.exists) await getClient().deleteCollection(name);
}
