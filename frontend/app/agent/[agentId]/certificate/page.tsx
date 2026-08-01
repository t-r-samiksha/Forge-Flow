import CertificateScreen from "@/components/screens/CertificateScreen";

export default function AgentCertificatePage({ params }: { params: { agentId: string } }) {
  return <CertificateScreen agentId={params.agentId} />;
}
