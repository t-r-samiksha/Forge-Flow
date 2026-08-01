import { redirect } from "next/navigation";
import { isValidCampaignId } from "@/lib/campaigns";
import SetupScreen from "@/components/screens/SetupScreen";

export default function SetupPage({ params }: { params: { campaignId: string } }) {
  if (!isValidCampaignId(params.campaignId)) {
    redirect("/campaigns");
  }
  return <SetupScreen campaignId={params.campaignId} />;
}
