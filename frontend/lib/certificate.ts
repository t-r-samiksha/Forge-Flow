import type { ApiForgedAgent } from "./api";
import { resolveAgentConfig, type Campaign } from "./campaigns";
import { ACHIEVEMENT_DEFS } from "./achievements";
import { freeformShippedConfig } from "./freeformAgentView";

export interface CertData {
  agentName: string;
  campaignTitle: string;
  model: string;
  forgeScore: number;
  xpEarned: number;
  buildTime: string;
  version: number;
  badges: string[];
}

function formatBuildTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function buildCertData(
  agent: ApiForgedAgent,
  campaign: Campaign | undefined,
  achievements: string[]
): CertData {
  const model = campaign
    ? resolveAgentConfig(campaign, agent.config).model
    : freeformShippedConfig(agent).model;
  const badges = achievements
    .map((key) => ACHIEVEMENT_DEFS[key])
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => `${d.icon} ${d.label}`);
  return {
    agentName: agent.name,
    campaignTitle: campaign?.title ?? "Freeform Build",
    model,
    forgeScore: agent.forgeScore,
    xpEarned: agent.xpEarned,
    buildTime: formatBuildTime(agent.forgeTime),
    version: agent.version,
    badges: badges.length ? badges : ["🔨 Shipped Agent"],
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCertificate(ctx: CanvasRenderingContext2D, W: number, H: number, data: CertData) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0a0a12");
  grad.addColorStop(1, "#15101f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const o1 = ctx.createRadialGradient(150, 120, 10, 150, 120, 260);
  o1.addColorStop(0, "rgba(139,92,246,.35)");
  o1.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = o1;
  ctx.fillRect(0, 0, W, H);

  const o2 = ctx.createRadialGradient(W - 150, H - 120, 10, W - 150, H - 120, 260);
  o2.addColorStop(0, "rgba(34,211,238,.28)");
  o2.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = o2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(139,92,246,.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  ctx.fillStyle = "#67e8f9";
  ctx.font = "600 15px monospace";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`FORGEFLOW · ${data.campaignTitle.toUpperCase()} · CERTIFICATE OF FORGING`, 50, 70);

  ctx.fillStyle = "#eaeaf4";
  ctx.font = '700 40px "Space Grotesk", sans-serif';
  ctx.fillText(data.agentName, 50, 140);

  ctx.fillStyle = "#9494a8";
  ctx.font = '16px "Inter", sans-serif';
  ctx.fillText(`model ${data.model}  ·  forge score ${data.forgeScore}/100  ·  v${data.version}`, 50, 172);

  const stats: [string, string, string][] = [
    ["XP EARNED", `${data.xpEarned} XP`, "#a78bfa"],
    ["BUILD TIME", data.buildTime, "#22d3ee"],
    ["FORGE SCORE", `${data.forgeScore}/100`, "#34d399"],
  ];
  stats.forEach(([label, value, color], i) => {
    const x = 50 + i * 235;
    ctx.fillStyle = "#56566a";
    ctx.font = "11px monospace";
    ctx.fillText(label, x, 240);
    ctx.fillStyle = color;
    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.fillText(value, x, 275);
  });

  ctx.fillStyle = "#56566a";
  ctx.font = "11px monospace";
  ctx.fillText("BADGES", 50, 340);
  data.badges.slice(0, 6).forEach((b, i) => {
    const x = 50 + (i % 3) * 235;
    const y = 358 + Math.floor(i / 3) * 42;
    ctx.fillStyle = "rgba(52,211,153,.12)";
    ctx.strokeStyle = "rgba(52,211,153,.4)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, 218, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#34d399";
    ctx.font = "600 13px monospace";
    ctx.fillText(b, x + 12, y + 22);
  });

  ctx.fillStyle = "#56566a";
  ctx.font = "13px monospace";
  ctx.fillText("Forged by HiDevs · ForgeFlow · Every decision was yours", 50, H - 40);
  ctx.fillStyle = "#8b5cf6";
  ctx.font = '700 20px "Space Grotesk", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText("⬡ ForgeFlow", W - 50, H - 40);
  ctx.textAlign = "left";
}
