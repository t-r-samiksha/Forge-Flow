"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Award,
  Download,
  FileText,
  GitCompare,
  Link2,
  MessageCircle,
  MoreVertical,
  Swords,
  Trash2,
} from "lucide-react";
import { reducedMotion } from "@/lib/effects";
import { listAgents, deleteAgent, type ApiForgedAgent } from "@/lib/api";
import { getUserId, initAuth } from "@/lib/session";
import { useGameStore } from "@/lib/store";
import { getCampaign, type Campaign } from "@/lib/campaigns";
import { activeMissions } from "@/lib/freeformMissions";
import { getTemplateLevelDefaults } from "@/lib/agentTemplates";
import { MISSION_META } from "@/lib/freeformMissionMeta";
import { freeformShippedConfig } from "@/lib/freeformAgentView";
import { buildCertData, drawCertificate } from "@/lib/certificate";
import { buildShareUrl } from "@/lib/share";
import { showToast } from "@/lib/effects";
import BadgeShelf from "@/components/gamification/BadgeShelf";
import LeaderboardWidget from "@/components/gamification/LeaderboardWidget";

/** Real card stats for a template, computed from the same activeMissions()
 * the actual build flow uses — replaces campaigns.ts's static card.missionsCount
 * /estimateMin/totalXP, which went stale after the Levels/Missions
 * restructuring (§21) turned each 2-mission legacy campaign into a real
 * 6-mission freeform build (§37: found live, cards still said "2
 * missions · 75 XP" for both Retriever and Tool-Using Agent). */
function realCardStats(campaignId: string): { missionsCount: number; estimateMin: number; totalXP: number } {
  const { wantsKnowledge, wantsTools } = getTemplateLevelDefaults(campaignId);
  const missions = activeMissions({ wantsKnowledge: !!wantsKnowledge, wantsTools: !!wantsTools });
  return {
    missionsCount: missions.length,
    estimateMin: missions.reduce((s, m) => s + MISSION_META[m.key].estimateMin, 0),
    totalXP: missions.reduce((s, m) => s + m.reward, 0),
  };
}

const HERO_WORDS: { text: string; accent?: boolean; br?: boolean }[] = [
  { text: "Ship" },
  { text: "a" },
  { text: "real AI agent", accent: true },
  { text: "", br: true },
  { text: "one" },
  { text: "decision" },
  { text: "at" },
  { text: "a" },
  { text: "time." },
];

function TiltCard({
  campaign,
  shipped,
  skipEntrance,
  onDeleted,
}: {
  campaign: Campaign;
  shipped: ApiForgedAgent | null;
  skipEntrance: boolean;
  onDeleted: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const achievements = useGameStore((s) => s.achievements);

  const handleDelete = async () => {
    if (!shipped || deleting) return;
    setMenuOpen(false);
    const ok = window.confirm(
      `Delete "${shipped.name}"? This permanently deletes the real Lyzr agent and can't be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAgent(getUserId(), shipped.id);
      showToast("🗑", "Agent deleted.");
      onDeleted();
    } catch (err) {
      showToast("⚠", err instanceof Error ? err.message : "Failed to delete agent.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const downloadCertificate = async () => {
    if (!shipped) return;
    const data = buildCertData(shipped, campaign, achievements);
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    drawCertificate(ctx, canvas.width, canvas.height, data);
    const a = document.createElement("a");
    a.download = "agent-forge-certificate.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    showToast("⬇", "Certificate downloaded.");
    setMenuOpen(false);
  };

  const shareCertificate = () => {
    if (!shipped) return;
    const data = buildCertData(shipped, campaign, achievements);
    const url = buildShareUrl("cert", data);
    navigator.clipboard?.writeText(url);
    showToast("🔗", "Certificate link copied — paste it anywhere.");
    setMenuOpen(false);
  };

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || reducedMotion()) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (py - 0.5) * -8;
    const ry = (px - 0.5) * 10;
    setStyle({
      transform: `translateY(-4px) rotateX(${rx}deg) rotateY(${ry}deg)`,
      // @ts-expect-error custom property
      "--mx": `${e.clientX - r.left}px`,
      "--my": `${e.clientY - r.top}px`,
    });
  };

  const handleLeave = () => setStyle({});

  const cardStats = realCardStats(campaign.id);

  return (
    <div
      ref={cardRef}
      onClick={shipped ? undefined : () => router.push(`/build/new?template=${campaign.id}`)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={style}
      className={`ccard${shipped ? " completed" : ""}`}
    >
      {shipped && (
        <motion.div
          initial={skipEntrance ? false : { opacity: 0, y: -4, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="ccard-ribbon"
        >
          shipped
        </motion.div>
      )}
      {shipped && (
        <div ref={menuRef} className="ccard-kebab-wrap">
          <button
            type="button"
            className="ccard-kebab"
            aria-label="Certificate options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="ccard-menu">
              <button
                type="button"
                className="ccard-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  router.push(`/agent/${shipped.id}/certificate`);
                }}
              >
                <Award size={14} /> View certificate
              </button>
              <button
                type="button"
                className="ccard-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  void downloadCertificate();
                }}
              >
                <Download size={14} /> Download certificate
              </button>
              <button
                type="button"
                className="ccard-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  shareCertificate();
                }}
              >
                <Link2 size={14} /> Share certificate
              </button>
              <button
                type="button"
                className="ccard-menu-item ccard-menu-item-danger"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete();
                }}
              >
                <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete agent"}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="ccard-icon">{campaign.card.icon}</div>
      <h3>{campaign.title}</h3>
      <p>{campaign.card.description}</p>
      <div className="ccard-stack">
        {campaign.card.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="ccard-meta">
        <span>
          <b>{cardStats.missionsCount}</b> missions
        </span>
        <span>
          <b>~{cardStats.estimateMin}</b> min
        </span>
        <span>
          <b>{cardStats.totalXP}</b> XP
        </span>
      </div>

      {shipped ? (
        <div className="ccard-actions-v2">
          <button
            type="button"
            className="ccard-btn talk"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/agent/${shipped.id}/chat`);
            }}
          >
            <MessageCircle size={14} /> Talk to Agent
          </button>
          <div className="ccard-actions-secondary">
            <button
              type="button"
              className="ccard-btn view"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/agent/${shipped.id}/doc`);
              }}
            >
              <FileText size={13} /> View
            </button>
            <button
              type="button"
              className="ccard-btn arena"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/agent/${shipped.id}/arena`);
              }}
            >
              <Swords size={13} /> Red Team
            </button>
            <button
              type="button"
              className="ccard-btn cmp"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/agent/${shipped.id}/compare`);
              }}
            >
              <GitCompare size={13} /> Compare
            </button>
          </div>
        </div>
      ) : (
        <div className="ccard-go">start build →</div>
      )}
    </div>
  );
}

/** One card per freeform-shipped agent (campaignId "custom") — same
 * ccard/ccard-actions-v2 styling and action set as TiltCard's shipped
 * state (Talk/View/Red Team/Compare + a certificate kebab menu), adapted
 * rather than shared 1:1 since a freeform agent has no fixed `Campaign`
 * to key its title/icon/tags off of. Real config (role/model) is read
 * from the agent's own lyzrPayload via freeformShippedConfig, same source
 * the post-ship hub and the 4 destination screens already use. */
function FreeformAgentCard({
  agent,
  skipEntrance,
  onDeleted,
}: {
  agent: ApiForgedAgent;
  skipEntrance: boolean;
  onDeleted: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const achievements = useGameStore((s) => s.achievements);
  const cfg = freeformShippedConfig(agent);
  // Real template provenance (row 1, FIX 1) — the real campaign/template
  // title when this build started from ?template=<id>, "Freeform" for a
  // genuine "Start from scratch" build or an agent shipped before
  // templateId existed (never guessed).
  const templateTitle = agent.templateId ? getCampaign(agent.templateId)?.title : undefined;

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const handleDelete = async () => {
    if (deleting) return;
    setMenuOpen(false);
    const ok = window.confirm(
      `Delete "${agent.name}"? This permanently deletes the real Lyzr agent and can't be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAgent(getUserId(), agent.id);
      showToast("🗑", "Agent deleted.");
      onDeleted();
    } catch (err) {
      showToast("⚠", err instanceof Error ? err.message : "Failed to delete agent.");
      setDeleting(false);
    }
  };

  const downloadCertificate = async () => {
    const data = buildCertData(agent, undefined, achievements);
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    drawCertificate(ctx, canvas.width, canvas.height, data);
    const a = document.createElement("a");
    a.download = "agent-forge-certificate.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    showToast("⬇", "Certificate downloaded.");
    setMenuOpen(false);
  };

  const shareCertificate = () => {
    const data = buildCertData(agent, undefined, achievements);
    const url = buildShareUrl("cert", data);
    navigator.clipboard?.writeText(url);
    showToast("🔗", "Certificate link copied — paste it anywhere.");
    setMenuOpen(false);
  };

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || reducedMotion()) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (py - 0.5) * -8;
    const ry = (px - 0.5) * 10;
    setStyle({
      transform: `translateY(-4px) rotateX(${rx}deg) rotateY(${ry}deg)`,
      // @ts-expect-error custom property
      "--mx": `${e.clientX - r.left}px`,
      "--my": `${e.clientY - r.top}px`,
    });
  };

  const handleLeave = () => setStyle({});

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={style}
      className="ccard completed"
    >
      <motion.div
        initial={skipEntrance ? false : { opacity: 0, y: -4, scale: 0.6 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        className="ccard-ribbon"
      >
        shipped
      </motion.div>
      <div ref={menuRef} className="ccard-kebab-wrap">
        <button
          type="button"
          className="ccard-kebab"
          aria-label="Certificate options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <div className="ccard-menu">
            <button
              type="button"
              className="ccard-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                router.push(`/agent/${agent.id}/certificate`);
              }}
            >
              <Award size={14} /> View certificate
            </button>
            <button
              type="button"
              className="ccard-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                void downloadCertificate();
              }}
            >
              <Download size={14} /> Download certificate
            </button>
            <button
              type="button"
              className="ccard-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                shareCertificate();
              }}
            >
              <Link2 size={14} /> Share certificate
            </button>
            <button
              type="button"
              className="ccard-menu-item ccard-menu-item-danger"
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete agent"}
            </button>
          </div>
        )}
      </div>
      <div className="ccard-icon">⬡</div>
      <h3>{agent.name}</h3>
      <p>
        {cfg.role} · {cfg.model}
      </p>
      <div className="ccard-stack">
        <span className="tag">{templateTitle ? `${templateTitle} template` : "Freeform"}</span>
      </div>
      <div className="ccard-meta">
        <span>
          <b>{agent.forgeScore}</b>/100
        </span>
        <span>
          <b>{agent.xpEarned}</b> XP
        </span>
      </div>

      <div className="ccard-actions-v2">
        <button
          type="button"
          className="ccard-btn talk"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/agent/${agent.id}/chat`);
          }}
        >
          <MessageCircle size={14} /> Talk to Agent
        </button>
        <div className="ccard-actions-secondary">
          <button
            type="button"
            className="ccard-btn view"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/agent/${agent.id}/doc`);
            }}
          >
            <FileText size={13} /> View
          </button>
          <button
            type="button"
            className="ccard-btn arena"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/agent/${agent.id}/arena`);
            }}
          >
            <Swords size={13} /> Red Team
          </button>
          <button
            type="button"
            className="ccard-btn cmp"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/agent/${agent.id}/compare`);
            }}
          >
            <GitCompare size={13} /> Compare
          </button>
        </div>
      </div>
    </div>
  );
}

function ScratchCard() {
  const router = useRouter();
  return (
    <div className="ccard" onClick={() => router.push("/build/new")}>
      <div className="ccard-icon">🛠️</div>
      <h3>Start from scratch</h3>
      <p>
        Freeform build — name it, write real instructions, pick a model, and ship any agent.
        Not locked to a scenario.
      </p>
      <div className="ccard-stack">
        <span className="tag">Freeform</span>
        <span className="tag">Any agent</span>
      </div>
      <div className="ccard-meta">
        <span>self-paced</span>
      </div>
      <div className="ccard-go">start building →</div>
    </div>
  );
}

/** Multi-Agent Crew (Phase 5) — a distinct top-level Build Type, not a
 * template within the single-agent AgentDraft flow (FORGEFLOW_V3_SPEC.md
 * §3b "Templates vs. Build Types"), so this routes to its own /build/crew
 * flow rather than /build/new?template=. */
function CrewCard() {
  const router = useRouter();
  return (
    <div className="ccard" onClick={() => router.push("/build/crew")}>
      <div className="ccard-icon">🕸️</div>
      <h3>Build a Crew</h3>
      <p>
        N real sub-agents plus a real orchestrator that routes between them — each ships as its
        own independent Lyzr agent.
      </p>
      <div className="ccard-stack">
        <span className="tag">Multi-agent</span>
        <span className="tag">Orchestration</span>
      </div>
      <div className="ccard-meta">
        <span>own 4-level flow</span>
      </div>
      <div className="ccard-go">start building →</div>
    </div>
  );
}

const HERO_SEEN_KEY = "forge:campaignsHeroSeen";

const retrieverCampaign = getCampaign("retriever")!;
const toolAgentCampaign = getCampaign("tool-agent")!;

export default function CampaignMapScreen() {
  const startTimer = useGameStore((s) => s.startTimer);
  const [shippedRetriever, setShippedRetriever] = useState<ApiForgedAgent | null>(null);
  const [shippedToolAgent, setShippedToolAgent] = useState<ApiForgedAgent | null>(null);
  const [freeformAgents, setFreeformAgents] = useState<ApiForgedAgent[]>([]);
  const [heroPlayed, setHeroPlayed] = useState(false);

  useEffect(() => {
    startTimer();
  }, [startTimer]);

  // Runs before paint: the entrance cascade should only ever play on the
  // very first time this session a user lands here — every return visit
  // (back-nav, forward-nav, or any other remount within the same tab
  // session) should show the final state immediately, matching the
  // reference HTML's `el.dataset.done` guard on `revealHero()`. Checking
  // synchronously pre-paint (rather than in useEffect) means a repeat
  // mount never has a chance to render the hidden/animating state first.
  useLayoutEffect(() => {
    if (sessionStorage.getItem(HERO_SEEN_KEY)) {
      setHeroPlayed(true);
    } else {
      sessionStorage.setItem(HERO_SEEN_KEY, "1");
    }
  }, []);

  useEffect(() => {
    // Non-blocking: the hero + grid paint immediately with the default
    // "not shipped" card; this just upgrades the Retriever card in place
    // once (if) a shipped agent is found. Never gates the initial render.
    // Waits for initAuth() first (§36) — getUserId() called before the
    // real Supabase session finishes loading returns "", which used to
    // freeze this call's URL with an empty id and never retry, silently
    // leaving a genuinely signed-in user's real agent cards unloaded.
    initAuth()
      .then(() => listAgents(getUserId()))
      .then((agents) => {
        const retrieverMatch = agents.find((a) => a.campaignId === "retriever");
        if (retrieverMatch) setShippedRetriever(retrieverMatch);
        const toolMatch = agents.find((a) => a.campaignId === "tool-agent");
        if (toolMatch) setShippedToolAgent(toolMatch);
        // Freeform ships always carry campaignId "custom" (see
        // FreeformBuildScreen's ship()) — every one of them gets its own
        // card, unlike the fixed campaigns' single card slot each.
        setFreeformAgents(agents.filter((a) => a.campaignId === "custom"));
      })
      .catch(() => {
        /* no agents yet, or backend unreachable — cards just stay unshipped */
      });
  }, []);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="launch-layout">
        <div>
          <div className="eyebrow">accept the assignment</div>

          <h1 className="hero">
            {HERO_WORDS.map((w, i) =>
              w.br ? (
                <br key={i} />
              ) : (
                <motion.span
                  key={i}
                  initial={heroPlayed ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: heroPlayed ? 0 : i * 0.07,
                    duration: 0.6,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                  className={w.accent ? "w accent" : "w"}
                >
                  {w.text}&nbsp;
                </motion.span>
              )
            )}
          </h1>

          <p className="lede">
            No tutorials to skim. Every screen hands you one real engineering choice, wires
            it into working code, and shows your agent assemble live. Pick the build that
            saves Meridian.
          </p>

          <BadgeShelf />

          {/* Section 1: templates/build-types — always the same 4 cards,
              regardless of what the user has already shipped. Content and
              behavior unchanged from before the split. */}
          <div className="eyebrow" style={{ marginTop: 28 }}>
            start a build
          </div>
          <div className="campaign-grid">
            <ScratchCard />
            <TiltCard
              campaign={retrieverCampaign}
              shipped={shippedRetriever}
              skipEntrance={heroPlayed}
              onDeleted={() => setShippedRetriever(null)}
            />
            <TiltCard
              campaign={toolAgentCampaign}
              shipped={shippedToolAgent}
              skipEntrance={heroPlayed}
              onDeleted={() => setShippedToolAgent(null)}
            />
            <CrewCard />
          </div>

          {/* Section 2: freeform-shipped agents — "manage what you've
              already built," kept visually and functionally separate from
              the templates above so it doesn't get lost as this list
              grows. Hidden entirely (not an empty header) when there's
              nothing shipped yet. */}
          {freeformAgents.length > 0 ? (
            <>
              <div className="eyebrow" style={{ marginTop: 40 }}>
                your agents
              </div>
              <div className="campaign-grid">
                {freeformAgents.map((agent) => (
                  <FreeformAgentCard
                    key={agent.id}
                    agent={agent}
                    skipEntrance={heroPlayed}
                    onDeleted={() => setFreeformAgents((prev) => prev.filter((a) => a.id !== agent.id))}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <aside>
          <LeaderboardWidget />
        </aside>
      </div>
    </div>
  );
}
