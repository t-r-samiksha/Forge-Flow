import CrewChatScreen from "@/components/screens/CrewChatScreen";

export default function CrewChatPage({ params }: { params: { crewId: string } }) {
  return <CrewChatScreen crewId={params.crewId} />;
}
