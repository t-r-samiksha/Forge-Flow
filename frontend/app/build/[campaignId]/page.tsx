import { redirect } from "next/navigation";
import { isValidCampaignId } from "@/lib/campaigns";
import BuildScreen from "@/components/screens/BuildScreen";

export default function BuildPage({ params }: { params: { campaignId: string } }) {
  if (!isValidCampaignId(params.campaignId)) {
    redirect("/campaigns");
  }
  return <BuildScreen campaignId={params.campaignId} />;
}
