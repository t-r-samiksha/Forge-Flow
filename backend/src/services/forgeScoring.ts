export interface ForgeScoreInput {
  instruction: string;
  temperature: number;
  model: string;
  /** top_k, when the campaign has a knowledge-retrieval slot. Campaigns
   * without one (e.g. Tool-Using Agent) omit it — that scoring bucket is
   * auto-granted rather than penalizing a concept that doesn't apply. */
  topK?: number;
}

export function calcForgeScore(
  input: ForgeScoreInput,
  forgeTimeSeconds: number,
  estimateMin: number
): number {
  let score = 0;

  // Instruction quality — +20 max, scales with grounded length
  score += Math.min(20, Math.round((input.instruction.length / 60) * 20));

  // Temperature appropriateness — +15 max, best near 0.3 for a factual agent
  if (!isNaN(input.temperature) && input.temperature >= 0 && input.temperature <= 1) {
    score += Math.max(0, Math.round(15 - Math.abs(input.temperature - 0.3) * 15));
  }

  // Model selected — +15 flat, any valid model selection counts
  if (input.model) score += 15;

  // Knowledge config quality — +20 max, top_k in the 3-5 sweet spot
  if (input.topK === undefined) score += 20;
  else if (input.topK >= 3 && input.topK <= 5) score += 20;
  else if (input.topK > 0) score += 12;

  // Tool config completeness — +15 max, not applicable per-campaign yet (auto-granted)
  score += 15;

  // Completion speed bonus — +15 max
  const estimateSeconds = estimateMin * 60;
  if (forgeTimeSeconds > 0 && forgeTimeSeconds <= estimateSeconds) score += 15;
  else if (forgeTimeSeconds <= estimateSeconds * 1.5) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}
