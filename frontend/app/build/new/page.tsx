import FreeformBuildScreen from "@/components/screens/FreeformBuildScreen";

export default function BuildNewPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  return <FreeformBuildScreen templateId={searchParams.template} />;
}
