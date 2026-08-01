import { Suspense } from "react";
import CompareScreen from "@/components/screens/CompareScreen";

export default function AgentComparePage({ params }: { params: { agentId: string } }) {
  return (
    <Suspense fallback={null}>
      <CompareScreen agentId={params.agentId} />
    </Suspense>
  );
}
