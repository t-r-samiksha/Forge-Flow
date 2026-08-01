import ArenaScreen from "@/components/screens/ArenaScreen";

export default function AgentArenaPage({ params }: { params: { agentId: string } }) {
  return <ArenaScreen agentId={params.agentId} />;
}
