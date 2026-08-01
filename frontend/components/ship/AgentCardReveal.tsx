"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { reducedMotion } from "@/lib/effects";
import type { ApiForgedAgent } from "@/lib/api";
import type { Campaign } from "@/lib/campaigns";

interface AgentCardRevealProps {
  agent: ApiForgedAgent;
  campaign: Campaign;
  model: string;
}

export default function AgentCardReveal({ agent, campaign, model }: AgentCardRevealProps) {
  const [flipped, setFlipped] = useState(reducedMotion());

  useEffect(() => {
    if (reducedMotion()) return;
    const t = setTimeout(() => setFlipped(true), 550);
    return () => clearTimeout(t);
  }, []);

  const { icon, gradientFrom, gradientTo } = campaign.agentCardTemplate;

  return (
    <div className="mx-auto mb-8 mt-2 flex justify-center" style={{ perspective: "1400px" }}>
      <motion.div
        className="relative h-[300px] w-[212px]"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.85, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-[rgba(var(--color-violet-rgb)/.45)]"
          style={{
            backfaceVisibility: "hidden",
            background: "linear-gradient(135deg, var(--color-violet), var(--color-plasma), var(--color-spring), var(--color-violet))",
            backgroundSize: "300% 300%",
            animation: reducedMotion() ? undefined : "gradmove 4s linear infinite",
            boxShadow: "0 12px 40px -12px rgba(var(--color-violet-rgb)/.6)",
          }}
        >
          <span className="text-5xl opacity-85">🔮</span>
          <span className="font-mono text-[10px] uppercase tracking-[.18em] text-on-accent/85">
            Agent Card
          </span>
        </div>

        <div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-line p-4 text-left"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: `linear-gradient(160deg, ${gradientFrom}, ${gradientTo})`,
            boxShadow: "0 12px 40px -12px rgba(var(--color-violet-rgb)/.6)",
          }}
        >
          <div>
            <span className="text-3xl">{icon}</span>
            <h3 className="mt-2 font-display text-[17px] font-bold leading-tight text-on-accent">
              {agent.name}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[.1em] text-on-accent/70">
              {campaign.title}
            </p>
          </div>

          <div className="space-y-1.5 rounded-lg bg-black/25 p-2.5 font-mono text-[11px] text-on-accent">
            <div className="flex justify-between">
              <span className="text-on-accent/60">Model</span>
              <span>{model || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-accent/60">Forge Score</span>
              <span>{agent.forgeScore}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-accent/60">XP</span>
              <span>{agent.xpEarned}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
