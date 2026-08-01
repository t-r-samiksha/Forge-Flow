"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAgent, type ApiForgedAgent } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getCampaign } from "@/lib/campaigns";
import { drawCertificate, buildCertData, type CertData } from "@/lib/certificate";
import { buildShareUrl } from "@/lib/share";
import { useGameStore } from "@/lib/store";

export default function CertificateScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const achievements = useGameStore((s) => s.achievements);
  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getAgent(getUserId(), agentId)
      .then(setAgentState)
      .catch(() => setNotFound(true));
  }, [agentId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  const campaign = agent ? getCampaign(agent.campaignId) : undefined;

  const buildData = (): CertData | null => {
    if (!agent || !campaign) return null;
    return buildCertData(agent, campaign, achievements);
  };

  useEffect(() => {
    const data = buildData();
    const canvas = canvasRef.current;
    if (!data || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => drawCertificate(ctx, canvas.width, canvas.height, data);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(draw);
    } else {
      draw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, achievements]);

  if (notFound) return null;
  if (!agent || !campaign) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading agent…</p>
      </div>
    );
  }

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "agent-forge-certificate.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const share = () => {
    const data = buildData();
    if (!data) return;
    setShareUrl(buildShareUrl("cert", data));
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push(`/ship/${agent.campaignId}`)}>
          ← back to ship day
        </button>
      </div>
      <div className="cert-shell">
        <div className="cert-canvas-wrap">
          <canvas ref={canvasRef} width={1000} height={600} />
        </div>
        <div className="cert-actions">
          <button type="button" className="ccard-btn view" onClick={download}>
            ⬇ Download PNG
          </button>
          <button type="button" className="ccard-btn share" onClick={share}>
            🔗 Share certificate
          </button>
          <button type="button" className="ccard-btn talk" onClick={() => router.push("/campaigns")}>
            🏠 Back to ForgeFlow
          </button>
        </div>

        {shareUrl && (
          <div className="share-box show">
            <div className="share-box-row">
              <input readOnly value={shareUrl} className="share-link-input" />
              <button
                type="button"
                className="ccard-btn share"
                style={{ flex: "none", padding: "9px 12px" }}
                onClick={() => navigator.clipboard?.writeText(shareUrl)}
              >
                Copy
              </button>
              <button
                type="button"
                className="ccard-btn li"
                style={{ flex: "none", padding: "9px 12px" }}
                onClick={() =>
                  window.open(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                    "_blank",
                    "noopener"
                  )
                }
              >
                in Share
              </button>
            </div>
            <div className="share-box-note">
              Public, static, no login — this link renders your certificate for anyone who opens
              it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
