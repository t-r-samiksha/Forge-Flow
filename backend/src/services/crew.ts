/** Multi-agent Crew orchestration — see FORGEFLOW_V3_SPEC.md §6. The
 * ROUTE_TO marker mechanism deliberately mirrors tools.ts's TOOL_CALL
 * pattern: a real contract baked into agent_instructions at creation, a
 * real marker parsed out of a real Lyzr response, a real action taken
 * (here: calling a sub-agent's real chat endpoint instead of a webhook). */

/** Builds the ROUTE_TO contract appended to the orchestrator's real
 * agent_instructions — same mechanism as TOOL_CALL's contract
 * (tools.ts's buildToolContract), just routing to a real sub-agent instead
 * of executing a webhook. Only needs role labels at creation time; the
 * actual forged_agent_id lookup happens later, at chat time, via
 * crew_members. */
export function buildRouteContract(roleLabels: string[]): string {
  if (roleLabels.length === 0) return "";
  const lines = roleLabels.map((r) => `- ${r}`);
  return (
    `\n\nYou are the orchestrator for a crew of specialists:\n${lines.join("\n")}\n\n` +
    `If the user's message is something one of these specialists is better placed to answer, ` +
    `respond with EXACTLY this and nothing else in that turn:\n` +
    `ROUTE_TO: <role label>\n` +
    `Use the role label exactly as listed above, verbatim. Otherwise, answer the user directly ` +
    `yourself — most messages you should just answer.`
  );
}

/** Parses a `ROUTE_TO: <role>` marker out of a real orchestrator response.
 * Mirrors tools.ts's parseToolCall in spirit — tolerates leading prose —
 * but the payload here is a plain role-label string, not JSON, so it just
 * takes the rest of the marker's line rather than brace-walking. */
export function parseRouteCall(response: string): string | null {
  const markerIdx = response.indexOf("ROUTE_TO:");
  if (markerIdx === -1) return null;
  const after = response.slice(markerIdx + "ROUTE_TO:".length);
  const line = (after.split("\n")[0] ?? "").trim();
  const role = line.replace(/^["'*]+|["'*]+$/g, "").trim();
  return role || null;
}

/** Case/whitespace-insensitive match between a parsed ROUTE_TO role and a
 * crew_members.role_label — real LLM output can vary casing even when
 * told to use the label verbatim. */
export function matchesRole(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
