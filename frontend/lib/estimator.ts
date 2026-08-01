/** Per-query cost/latency estimate — not billed usage, a rough model
 * so Compare and the doc notebook can show *why* a model choice matters
 * beyond answer quality. Formulas are illustrative, not Lyzr's real
 * metering; keep this file the single place they live. */
export interface ModelStats {
  label: string;
  costPer1kTokens: number;
  latencyBaseMs: number;
  quality: "good" | "best";
}

export const MODEL_STATS: Record<string, ModelStats> = {
  "gemini-2.5-flash": {
    label: "Flash",
    costPer1kTokens: 0.00015,
    latencyBaseMs: 280,
    quality: "good",
  },
  "gemini-2.5-pro": {
    label: "Pro",
    costPer1kTokens: 0.00125,
    latencyBaseMs: 640,
    quality: "best",
  },
};

export interface CostEstimate {
  model: ModelStats;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
}

export function estimateCost(modelKey: string, topK: number | string): CostEstimate {
  const model = MODEL_STATS[modelKey] ?? MODEL_STATS["gemini-2.5-flash"]!;
  const tk = typeof topK === "string" ? parseInt(topK, 10) || 5 : topK || 5;
  const inputTokens = 120 + tk * 180;
  const outputTokens = 140;
  const totalTokens = inputTokens + outputTokens;
  const cost = (totalTokens / 1000) * model.costPer1kTokens;
  const latencyMs = model.latencyBaseMs + tk * 14;
  return { model, inputTokens, outputTokens, totalTokens, cost, latencyMs };
}

export function knownModelKeys(): string[] {
  return Object.keys(MODEL_STATS);
}
