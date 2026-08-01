import { GoogleGenerativeAI, type EmbedContentRequest } from "@google/generative-ai";

// text-embedding-004 is retired on this API version; gemini-embedding-001 is
// the current embedding model. It only supports single embedContent calls
// (no batchEmbedContents), and defaults to 3072 dims, so we ask for 768 via
// outputDimensionality to keep vectors compact — supported by the REST API
// but not yet in this SDK version's types, hence the cast below.
const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

export class EmbeddingConfigError extends Error {}

function requireApiKey(): string {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new EmbeddingConfigError(
      "EMBEDDING_API_KEY is not configured — add a real key to backend/.env"
    );
  }
  return apiKey;
}

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!client) client = new GoogleGenerativeAI(requireApiKey());
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
  const request: EmbedContentRequest & { outputDimensionality: number } = {
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIM,
  };
  const result = await model.embedContent(request);
  return result.embedding.values;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((text) => embedText(text)));
}
