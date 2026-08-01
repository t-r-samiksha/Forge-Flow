import { redirect } from "next/navigation";
import { isValidCampaignId } from "@/lib/campaigns";
import StoryScreen from "@/components/screens/StoryScreen";

export default function StoryPage({ params }: { params: { campaignId: string } }) {
  if (!isValidCampaignId(params.campaignId)) {
    redirect("/campaigns");
  }
  return <StoryScreen campaignId={params.campaignId} />;
}
