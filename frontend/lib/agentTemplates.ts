import type { AgentDraft } from "./types";

/** Starting points for the freeform builder — conceptually related to
 * the "retriever" and "tool-agent" campaigns, but written fresh here
 * rather than derived from campaigns.ts's slot-driven data, since these
 * need to be plain editable AgentDraft values, not campaign missions. */
export const AGENT_TEMPLATES: Record<string, AgentDraft> = {
  retriever: {
    name: "Support Knowledge Agent",
    role: "customer support assistant",
    goal: "Answer customer questions using the team's own documentation instead of guessing",
    instructions:
      "Answer questions strictly using the knowledge base provided as context below the question. " +
      "If the context doesn't contain the answer, say you don't know rather than guessing. " +
      "Keep answers short and specific — quote or paraphrase the exact detail you used, don't pad with generic advice.",
    model: "gemini-2.5-flash",
    provider: "google",
    temperature: 0.3,
    knowledge: { topK: 4 },
    tools: [],
  },
  "tool-agent": {
    name: "Task Automation Agent",
    role: "task automation assistant",
    goal: "Complete requests by calling the right tool and reporting back clearly",
    instructions:
      "Decide whether the request needs a registered tool. Call at most one tool per turn, wait for its result, " +
      "then answer using that result — never fabricate a tool's output. " +
      "If no tool applies, answer directly. If you're unsure which tool fits, ask a clarifying question instead of guessing.",
    model: "gemini-2.5-flash",
    provider: "google",
    temperature: 0.2,
    knowledge: { topK: 4 },
    tools: [],
  },
};

export function getTemplate(id: string | undefined): AgentDraft | undefined {
  if (!id) return undefined;
  const preset = AGENT_TEMPLATES[id];
  return preset ? { ...preset, knowledge: { ...preset.knowledge! }, tools: [...(preset.tools ?? [])] } : undefined;
}
