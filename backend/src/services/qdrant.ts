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

export async function ensureCollection(agentId: string): Promise<void> {
  const name = collectionName(agentId);
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

export interface ChunkToUpsert {
  id?: string;
  vector: number[];
  text: string;
  docId: string;
  filename: string;
  chunkIndex: number;
}

export async function upsertChunks(agentId: string, chunks: ChunkToUpsert[]): Promise<void> {
  if (chunks.length === 0) return;
  await ensureCollection(agentId);
  await getClient().upsert(collectionName(agentId), {
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

export interface SearchResultChunk {
  text: string;
  docId: string;
  filename: string;
  chunkIndex: number;
  score: number;
}

export async function search(
  agentId: string,
  queryVector: number[],
  topK = 5
): Promise<SearchResultChunk[]> {
  const name = collectionName(agentId);
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
