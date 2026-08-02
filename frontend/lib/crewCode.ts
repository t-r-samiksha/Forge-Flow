import { pyLine } from "./codegen";

export interface CrewMemberInfo {
  roleLabel: string;
  /** Real Lyzr agent_id once this sub-agent has shipped — undefined
   * before Level 2's mission for it completes. Never fabricated: shown
   * as "pending" rather than a fake placeholder id. */
  agentId?: string;
}

/** Real crew composition (FORGEFLOW_V3_SPEC.md §6/§5b) — mirrors exactly
 * what POST /api/crew/create persists into crews/crew_members once Level 4
 * runs. Shown at Level 4 with real ids; members not yet shipped show as
 * pending, never a fabricated id. */
export function generateCrewConfigPy(
  members: CrewMemberInfo[],
  orchestratorAgentId?: string
): string {
  const memberLines = members
    .map(
      (m) =>
        `    {"role_label": ${pyLine(m.roleLabel)}, "agent_id": ${m.agentId ? pyLine(m.agentId) : "None  # not shipped yet"}},`
    )
    .join("\n");

  return `# The real crew composition — written to crews/crew_members by
# POST /api/crew/create once every real agent_id below exists.

ORCHESTRATOR_AGENT_ID = ${orchestratorAgentId ? pyLine(orchestratorAgentId) : "None  # ships in Level 3"}

CREW_MEMBERS = [
${memberLines || "    # (define sub-agents in Level 1 first)"}
]`;
}

/** Real routing logic — mirrors tool_handler.py's parse -> execute -> feed
 * back pattern from Phase 3 exactly, just with ROUTE_TO instead of
 * TOOL_CALL and "call a real sub-agent's chat endpoint" instead of "run a
 * real HTTP webhook" as the action (FORGEFLOW_V3_SPEC.md §6). */
export function generateOrchestratorPy(roleLabels: string[]): string {
  const roleLines =
    roleLabels.length > 0
      ? roleLabels.map((r) => `#   - ${r}`).join("\n")
      : "#   (define sub-agents in Level 1 first)";

  return `# Appended to the orchestrator's real agent_instructions at creation
# (this is ROUTE_CONTRACT below) — see backend/src/services/crew.ts's
# buildRouteContract(), the exact real function that builds this text.
# Real specialists in this crew:
${roleLines}

ROUTE_CONTRACT = (
    "\\n\\nYou are the orchestrator for a crew of specialists:\\n"
    "<role label list>\\n\\n"
    'If another specialist is better placed to answer, respond with EXACTLY:\\n'
    "ROUTE_TO: <role label>\\n"
    "Otherwise, answer the user directly yourself."
)

def handle_crew_chat(crew_id: str, message: str, session_id: str) -> tuple[str, str | None]:
    """Runs on every crew chat message. Returns (response, routed_to)."""
    orchestrator_id = crew_config.ORCHESTRATOR_AGENT_ID
    response = lyzr_chat(orchestrator_id, message, f"{session_id}_orch")

    role = parse_route_call(response)          # find ROUTE_TO: <role> (real parse, crew.ts)
    if role is None:
        return response, None                  # orchestrator answered directly — done

    member = next((m for m in crew_config.CREW_MEMBERS
                   if m["role_label"].lower() == role.lower()), None)
    if member is None:
        return response, None                  # no match — fall back to orchestrator's text

    # real chat call to the real sub-agent's own agent_id, own session
    sub_session = f"{session_id}_{member['agent_id']}"
    final_response = lyzr_chat(member["agent_id"], message, sub_session)
    return final_response, member["role_label"]`;
}
