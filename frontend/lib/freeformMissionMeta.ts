import type { MissionKey } from "./freeformMissions";

/** Presentational-only metadata for the Situation Report chips — authored
 * per mission the same way the legacy campaigns authored `difficulty` /
 * `estimateMin` (not computed, not from an API). Kept in its own small
 * file rather than in freeformMissions.ts (so that verified §19 logic
 * module stays untouched) or inline in FreeformBuildScreen.tsx (so
 * CampaignMapScreen's template cards can also sum real per-mission
 * estimates without importing a whole screen component, §37). */
export const MISSION_META: Record<MissionKey, { difficulty: string; estimateMin: number }> = {
  identity: { difficulty: "Easy", estimateMin: 4 },
  instructions: { difficulty: "Medium", estimateMin: 8 },
  model: { difficulty: "Easy", estimateMin: 5 },
  retrieval: { difficulty: "Easy", estimateMin: 5 },
  toolDefine: { difficulty: "Medium", estimateMin: 6 },
  toolWire: { difficulty: "Easy", estimateMin: 4 },
  ship: { difficulty: "Easy", estimateMin: 3 },
  upload: { difficulty: "Easy", estimateMin: 4 },
};
