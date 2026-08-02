import { isValidToolName, isValidToolDescription, isValidToolEndpoint } from "./tools";

/** Minimal shape needed to score one tool's config — deliberately not the
 * full ToolDefInput, since paramsSchema isn't part of the validity check
 * (a tool that genuinely needs no args isn't invalid for having one). */
export interface ToolScoreInput {
  toolName: string;
  description: string;
  endpointUrl: string;
}

export interface ForgeScoreInput {
  instruction: string;
  temperature: number;
  model: string;
  /** top_k, when the campaign has a knowledge-retrieval slot. Campaigns
   * without one (e.g. Tool-Using Agent) omit it — that scoring bucket is
   * auto-granted rather than penalizing a concept that doesn't apply. */
  topK?: number;
  /** Real tool_defs rows attached to this agent (empty/omitted = no
   * tools). Scored against genuine validity, not a flat grant. */
  tools?: ToolScoreInput[];
  /** The exact instructions string actually sent to Lyzr for this
   * create/re-forge call (draft instructions + buildToolContract(...)).
   * Used to confirm the TOOL_CALL contract for each tool was genuinely
   * baked in this call (§18's build-time-only constraint), not just that
   * a tool_defs row exists. */
  instructionsWithToolContract?: string;
}

/** Real per-tool validity check, averaged across all attached tools:
 * a valid snake_case name, a real (non-trivial) description, a real
 * endpoint (builtin sentinel or well-formed http(s) URL), and proof the
 * TOOL_CALL contract for that exact tool name was baked into the
 * instructions actually sent this call. No tools attached scores 0 —
 * there is nothing here to be complete about. */
function scoreToolConfig(tools: ToolScoreInput[] | undefined, bakedInstructions: string | undefined): number {
  if (!tools || tools.length === 0) return 0;

  const perToolFractions = tools.map((t) => {
    const checks = [
      isValidToolName(t.toolName),
      isValidToolDescription(t.description),
      isValidToolEndpoint(t.endpointUrl),
      Boolean(bakedInstructions?.includes(`- ${t.toolName}:`)),
    ];
    return checks.filter(Boolean).length / checks.length;
  });

  const avg = perToolFractions.reduce((a, b) => a + b, 0) / perToolFractions.length;
  return Math.round(avg * 15);
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

  // Tool config completeness — +15 max, real per-tool validity (§18)
  score += scoreToolConfig(input.tools, input.instructionsWithToolContract);

  // Completion speed bonus — +15 max
  const estimateSeconds = estimateMin * 60;
  if (forgeTimeSeconds > 0 && forgeTimeSeconds <= estimateSeconds) score += 15;
  else if (forgeTimeSeconds <= estimateSeconds * 1.5) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}
