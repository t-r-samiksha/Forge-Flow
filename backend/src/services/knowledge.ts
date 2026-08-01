/** Ground-truth reference material appended to a campaign's real agent
 * instructions right before the Lyzr API call — never exposed to the
 * frontend, so the user's own written instruction (and every UI surface
 * that displays or edits it — Compare, the chat config sidebar, the doc
 * page's code snippets) stays exactly what they typed. Without this, the
 * "retriever" campaign has no real Qdrant/knowledge-base wiring behind
 * it (that part of the mission narrative is illustrative, not a real
 * pipeline), so the live agent has nothing to answer from and correctly
 * declines every question. This is a stand-in for real retrieval — long
 * context grounding, not vector search — but it means the shipped
 * agent's answers are genuinely correct rather than fabricated or a
 * canned refusal. */
const KNOWLEDGE_CORPUS_BY_CAMPAIGN: Record<string, string> = {
  // Illustrative telecom recharge-support content for the demo — written
  // to be realistic, not sourced from or claiming to be actual Airtel
  // policy. Same role as the Meridian corpus it replaced: something
  // concrete for the shipped agent to answer from.
  retriever: `Airtel Support Docs — Prepaid Recharge & Validity
- Recharge validity: Plan validity ranges from 1 day (data top-ups) to 84 days (long-term packs), shown on the plan card before you confirm. Validity starts the moment the recharge is applied, not at midnight.
- Recharge before expiry: Recharging before your current plan expires adds the new plan's validity on top of any remaining days, so unused days are not lost.
- Insufficient balance: If your main balance drops to zero before you recharge, incoming calls and SMS keep working during a short grace period; outgoing calls and mobile data are paused until you recharge.

Airtel Support Docs — Recharge Methods & Failed Recharges
- Recharge channels: Recharges can be done via the Airtel Thanks app, airtel.in, UPI, net banking, debit/credit card, or at any authorized retail outlet.
- Failed recharge refund: If a recharge is deducted from your bank/UPI account but not credited to your number, it is auto-reversed to the original payment method within 5-7 business days. No manual refund request is needed in most cases.
- Wrong number recharge: A recharge sent to the wrong mobile number cannot be reversed or transferred once processed — always confirm the number before confirming payment.

Airtel Support Docs — Data Packs & Add-ons
- Data add-ons: Additional data packs can be purchased anytime and stack on top of your existing plan's data; they do not extend plan validity.
- Data rollover: Unused data from a data add-on carries over to the next recharge only if the new recharge is done before the add-on's own validity expires.
- Speed after exhaustion: Once your high-speed data quota is used up, speed is reduced to 64 kbps for the rest of that data pack's validity unless you buy another add-on.

Airtel Support Docs — Balance & Usage Check
- Check balance: Dial *121# or open the Airtel Thanks app home screen to see main balance, data balance, and validity.
- Usage history: Detailed call, SMS, and data usage for the last 6 months is available under "My Usage" in the Airtel Thanks app.

Airtel Support Docs — Offers & Cashback
- Recharge offers: Cashback and coupon offers shown at checkout apply automatically when eligible — no promo code entry needed for app/website recharges.
- First recharge offers: New-number first-recharge offers are one-time only and cannot be combined with other ongoing promotions.

Airtel Support Docs — Postpaid Billing
- Bill cycle: Postpaid bills are generated on a fixed date each month based on when the connection was activated; the due date is 15 days after bill generation.
- Late payment: Bills unpaid 5 days past the due date may result in outgoing services being suspended; incoming stays active for a further grace period before full suspension.
- Plan change: Postpaid plan upgrades apply immediately; downgrades apply from the next billing cycle.

Airtel Support Docs — DND & Value Added Services
- DND (Do Not Disturb): Activate or deactivate DND by sending START or STOP to 1909, or via the Airtel Thanks app under Settings > DND. Changes take up to 7 days to fully apply.
- VAS subscriptions: Value-added services (caller tunes, subscriptions) can be checked and cancelled under "My Subscriptions" in the Airtel Thanks app; cancelling stops the next renewal charge only, not the current cycle.

Airtel Support Docs — Number Port & SIM
- Porting in: To port an existing number to Airtel, send PORT <mobile number> to 1900 to receive a Unique Porting Code (UPC), valid for 15 days (4 days in Jammu & Kashmir).
- SIM replacement: A lost or damaged SIM can be replaced with the same number at any Airtel store with ID proof; the new SIM is typically active within 24 hours of activation at the store.`,
};

export function withKnowledgeCorpus(campaignId: string | undefined, instructions: string): string {
  const corpus = campaignId ? KNOWLEDGE_CORPUS_BY_CAMPAIGN[campaignId] : undefined;
  return corpus ? `${instructions}\n\n${corpus}` : instructions;
}
