"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";

type SetupChoice = "clone" | "scratch";

export default function SetupScreen({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const campaign = getCampaign(campaignId)!;
  const [choice, setChoice] = useState<SetupChoice>("clone");

  const lines = choice === "clone" ? campaign.setup.cloneLines : campaign.setup.scratchLines;

  return (
    <div className="mx-auto max-w-[820px] px-6 py-16">
      <div className="mb-[18px] font-mono text-[11px] tracking-[.02em] text-mute">
        <b className="font-semibold text-violet-hi">Setup</b>
        <span className="mx-2 text-line-2">/</span>
        get the project on your machine
      </div>

      <div
        className="rounded-2xl border border-line p-[26px]"
        style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
      >
        <h2 className="mb-2 font-display text-[23px] font-semibold tracking-[-.01em]">
          Everything runs on your machine
        </h2>
        <p className="mb-[22px] text-[13.5px] leading-[1.6] text-dim">
          HiDevs never hosts or executes your agent — you own the code. Choose how you
          want to start.
        </p>

        <div className="mb-[22px] flex flex-col gap-3 sm:flex-row">
          {(
            [
              { key: "clone", title: "Clone the template", desc: "Pre-wired boilerplate, folders, and deps" },
              { key: "scratch", title: "Start from scratch", desc: "Empty repo — you build the structure too" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setChoice(opt.key)}
              className={`flex-1 rounded-xl border-[1.5px] p-[18px] text-left transition-all ${
                choice === opt.key
                  ? "border-violet bg-violet-dim shadow-[0_0_0_1px_var(--color-violet),0_10px_30px_-12px_rgba(var(--color-violet-rgb)/.6)]"
                  : "border-line bg-panel-2 hover:-translate-y-0.5 hover:border-line-2"
              }`}
            >
              <b className="block font-display text-[15px]">{opt.title}</b>
              <span className="text-xs text-dim">{opt.desc}</span>
            </button>
          ))}
        </div>

        <div className="mb-4 overflow-hidden rounded-xl border border-line bg-code-bg shadow-[inset_0_1px_0_rgba(var(--color-sheen-rgb)/.03)]">
          <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-[15px] py-[11px]">
            <span className="h-[11px] w-[11px] rounded-full bg-[var(--dot-red)]" />
            <span className="h-[11px] w-[11px] rounded-full bg-[var(--dot-yellow)]" />
            <span className="h-[11px] w-[11px] rounded-full bg-[var(--dot-green)]" />
            <span className="ml-2 font-mono text-[11px] text-mute">
              bash — {campaign.setup.repoLabel}
            </span>
          </div>
          <div className="min-h-[150px] px-5 py-[18px] font-mono text-[13px] leading-[2.05]">
            {lines.map((line, i) => (
              <div
                key={choice + i}
                className="opacity-0"
                style={{
                  animation: `termline .35s cubic-bezier(.4,0,.2,1) ${i * 0.12}s forwards`,
                }}
              >
                {line.out ? (
                  <span className="text-dim">{line.out}</span>
                ) : (
                  <>
                    <span className="mr-2 text-spring">$</span>
                    <span className="text-text">{line.cmd}</span>
                    {line.cmt && <span className="ml-2 italic text-mute">{line.cmt}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="mb-6 flex items-center gap-2 text-xs italic text-mute">
          ↳ We can&apos;t peek at your machine — run these, then continue.
        </p>

        <div className="flex items-center justify-between gap-3.5">
          <span className="font-mono text-xs text-mute">
            Setup · no XP, no verification
          </span>
          <button
            type="button"
            onClick={() => router.push(`/build/${campaignId}`)}
            className="rounded-[10px] px-[26px] py-3 text-sm font-semibold text-on-accent transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
              boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
            }}
          >
            I&apos;ve run these →
          </button>
        </div>
      </div>
    </div>
  );
}
