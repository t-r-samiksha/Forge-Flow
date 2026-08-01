import { redirect } from "next/navigation";
import { isValidCampaignId } from "@/lib/campaigns";
import ShipScreen from "@/components/screens/ShipScreen";

export default function ShipPage({ params }: { params: { campaignId: string } }) {
  if (!isValidCampaignId(params.campaignId)) {
    redirect("/campaigns");
  }
  return <ShipScreen campaignId={params.campaignId} />;
}
