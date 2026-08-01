import AgentChatScreen from "@/components/screens/AgentChatScreen";

export default function AgentChatPage({ params }: { params: { agentId: string } }) {
  return <AgentChatScreen agentId={params.agentId} />;
}
