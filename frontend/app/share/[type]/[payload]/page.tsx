import SharePage from "@/components/screens/SharePage";

export default function ShareRoutePage({
  params,
}: {
  params: { type: string; payload: string };
}) {
  return <SharePage type={params.type} payload={params.payload} />;
}
