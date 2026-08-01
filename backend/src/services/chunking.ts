export interface TextChunk {
  text: string;
  index: number;
}

/**
 * Splits text into overlapping chunks sized in approximate tokens.
 * No tokenizer dependency — approximates 1 token ≈ 0.75 words (the
 * rule of thumb for English text), so word counts are scaled accordingly.
 */
export function chunkText(
  text: string,
  chunkSizeTokens = 500,
  overlapTokens = 50
): TextChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunkSizeWords = Math.round(chunkSizeTokens * 0.75);
  const overlapWords = Math.round(overlapTokens * 0.75);
  const stride = Math.max(1, chunkSizeWords - overlapWords);

  const chunks: TextChunk[] = [];
  let index = 0;
  for (let start = 0; start < words.length; start += stride) {
    const slice = words.slice(start, start + chunkSizeWords);
    if (slice.length === 0) break;
    chunks.push({ text: slice.join(" "), index: index++ });
    if (start + chunkSizeWords >= words.length) break;
  }
  return chunks;
}
