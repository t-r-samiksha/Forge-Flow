import type { CampaignBlueprint } from "./campaigns";
import type { AgentDraft } from "./types";

/** Builds a Live-Agent blueprint from the current draft, reusing the
 * exact node positions / wire paths the Retriever campaign's proven
 * diagram used. MODEL / INSTRUCTIONS / ROOT AGENT are always present;
 * the RETRIEVER and VECTOR STORE nodes (and the wires into them) only
 * exist when the developer has opted into knowledge — the diagram
 * reflects real state, not a canned always-on picture. */
export function buildFreeformBlueprint(hasKnowledge: boolean): CampaignBlueprint {
  const nodes: CampaignBlueprint["nodes"] = [
    { id: "query", kind: "io", label: "input", staticValue: "Query", x: "18%", y: "11.5%", alwaysLit: true },
    { id: "answer", kind: "io", label: "output", staticValue: "Answer", x: "82%", y: "11.5%" },
    { id: "model", kind: "default", label: "model", x: "14%", y: "38.5%" },
    { id: "instr", kind: "default", label: "instructions", x: "86%", y: "38.5%" },
    { id: "agent", kind: "hub", label: "root agent", staticValue: "Lyzr", x: "50%", y: "39.5%", decoration: "temp-pill" },
  ];
  const wires: CampaignBlueprint["wires"] = [
    { id: "qa", path: "M66,56 C 110,112 150,142 180,182", needsRef: true, alwaysOn: true },
    { id: "ma", path: "M66,184 C 110,186 150,186 176,188" },
    { id: "ia", path: "M294,184 C 250,186 210,186 184,188" },
    { id: "aans", path: "M180,182 C 230,132 262,100 294,60", needsRef: true },
  ];

  if (hasKnowledge) {
    nodes.push(
      { id: "ret", kind: "default", label: "retriever", x: "50%", y: "65%" },
      { id: "qdr", kind: "default", label: "vector store", staticValue: "Qdrant", x: "50%", y: "88%" }
    );
    wires.push(
      { id: "ar", path: "M180,216 L180,304", needsRef: true },
      { id: "rq", path: "M180,336 L180,410", needsRef: true }
    );
  }

  return {
    viewBox: "0 0 360 478",
    nodes,
    wires,
    packetFlow: hasKnowledge
      ? [
          { wireId: "qa", color: "#67e8f9", durationMs: 600 },
          { wireId: "ar", color: "#a78bfa", durationMs: 500 },
          { wireId: "rq", color: "#34d399", durationMs: 500 },
          { wireId: "aans", color: "#34d399", durationMs: 700 },
        ]
      : [
          { wireId: "qa", color: "#67e8f9", durationMs: 600 },
          { wireId: "aans", color: "#34d399", durationMs: 700 },
        ],
    finalNodeId: "answer",
    finalWireId: "aans",
  };
}

export interface BlueprintLiveState {
  litMap: Record<string, boolean>;
  valueMap: Record<string, string>;
  wireMap: Record<string, boolean>;
  tempOn: boolean;
  tempVal: string;
  bpLive: boolean;
  bpStatusText: string;
  bpCaption: string;
}

/** Drives which nodes/wires light up from real draft state — a node
 * lights only once its underlying field is genuinely filled. `shipped`
 * lights the whole path (the agent is live). */
export function blueprintLiveState(
  draft: AgentDraft,
  hasKnowledge: boolean,
  shipped: boolean
): BlueprintLiveState {
  const hasModel = draft.model.trim().length > 0;
  const hasInstr = draft.instructions.trim().length > 0;
  const coreReady = draft.name.trim().length > 0 && hasInstr && hasModel;

  const litMap: Record<string, boolean> = {
    model: hasModel,
    instr: hasInstr,
    agent: coreReady,
    answer: shipped || coreReady,
    ret: hasKnowledge,
    qdr: hasKnowledge,
  };
  const wireMap: Record<string, boolean> = {
    ma: hasModel,
    ia: hasInstr,
    aans: shipped || coreReady,
    ar: hasKnowledge,
    rq: hasKnowledge,
  };
  const valueMap: Record<string, string> = {
    model: hasModel ? draft.model.replace("gemini-2.5-", "").replace("gpt-4o-mini", "gpt-4o-mini") : "—",
    instr: hasInstr ? "set" : "—",
  };

  return {
    litMap,
    valueMap,
    wireMap,
    tempOn: hasModel,
    tempVal: hasModel ? `temp ${draft.temperature.toFixed(2)}` : "temp —",
    bpLive: shipped || coreReady,
    bpStatusText: shipped ? "live" : coreReady ? "ready to ship" : "assembling",
    bpCaption: shipped
      ? "Shipped — this agent is <b>live</b> on Lyzr."
      : coreReady
        ? "Core wired. <b>Ship it</b> whenever you're ready."
        : "Fill identity, instructions, and model to bring the <b>root agent</b> online.",
  };
}
