import AgentDocScreen from "@/components/screens/AgentDocScreen";

export default function AgentDocPage({ params }: { params: { agentId: string } }) {
  return <AgentDocScreen agentId={params.agentId} />;
}
