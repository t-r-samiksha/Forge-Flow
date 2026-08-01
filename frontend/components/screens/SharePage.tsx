"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeSharePayload } from "@/lib/share";
import { drawCertificate, type CertData } from "@/lib/certificate";

interface CompareShareData {
  query: string;
  aModel: string;
  aTemp: number;
  aInstr: string;
  aResponse: string | null;
  aCost: number;
  aLatency: number;
  bModel: string;
  bTemp: string;
  bInstr: string;
  bResponse: string | null;
  bCost: number;
  bLatency: number;
  securityMode: boolean;
  chanceA: number | null;
  chanceB: number | null;
  attackType: string | null;
}

export default function SharePage({ type, payload }: { type: string; payload: string }) {
  const router = useRouter();
  const [broken, setBroken] = useState(false);
  const [certData, setCertData] = useState<CertData | null>(null);
  const [compareData, setCompareData] = useState<CompareShareData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      if (type === "cert") {
        setCertData(decodeSharePayload<CertData>(payload));
      } else if (type === "compare") {
        setCompareData(decodeSharePayload<CompareShareData>(payload));
      } else {
        setBroken(true);
      }
    } catch {
      setBroken(true);
    }
  }, [type, payload]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!certData || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => drawCertificate(ctx, canvas.width, canvas.height, certData);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(draw);
    } else {
      draw();
    }
  }, [certData]);

  if (broken) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="share-shell">
          <p className="lede">This share link looks broken.</p>
          <CtaButton router={router} />
        </div>
      </div>
    );
  }

  if (certData) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="share-shell">
          <div className="share-kicker">shared certificate · agent forge</div>
          <div className="cert-canvas-wrap">
            <canvas ref={canvasRef} width={1000} height={600} />
          </div>
          <div className="cert-actions">
            <button type="button" className="ccard-btn view" onClick={downloadShareCert}>
              ⬇ Download PNG
            </button>
            <CtaButton router={router} />
          </div>
        </div>
      </div>
    );
  }

  if (compareData) {
    const d = compareData;
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="share-shell">
          <div className="share-kicker">shared config comparison · agent forge</div>
          <h1 style={{ fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)", fontSize: "clamp(22px,3vw,32px)", marginBottom: 10 }}>
            Same question.{" "}
            <span
              style={{
                background: "linear-gradient(120deg, var(--color-violet-hi), var(--color-plasma))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Different agent.
            </span>
          </h1>
          <p className="lede" style={{ marginBottom: 6 }}>
            &quot;{d.query}&quot;
          </p>
          {d.securityMode && d.chanceA !== null && d.chanceB !== null && (
            <div className={`share-verdict-badge ${d.chanceB >= d.chanceA ? "good" : "bad"}`}>
              Version A {d.chanceA >= 70 ? "held" : "broke"} · Version B{" "}
              {d.chanceB >= 70 ? "held" : "broke"} — both real, not simulated.
            </div>
          )}
          <div className="share-cmp-cols">
            <div className="cmp-col a">
              <div className="cmp-col-head">
                <b>Version A</b>
                <span className="cmp-tag a">shipped</span>
              </div>
              <div className="cmp-field">
                <label>model</label>
                <div className="locked-val">{d.aModel}</div>
              </div>
              <div className="cmp-field">
                <label>temperature</label>
                <div className="locked-val">{String(d.aTemp)}</div>
              </div>
              <div className="cmp-response">{d.aResponse ?? "—"}</div>
              <div className="cmp-stats">
                <span className="cmp-stat">
                  cost <b>${d.aCost.toFixed(5)}</b>
                </span>
                <span className="cmp-stat">
                  latency <b>{d.aLatency}ms</b>
                </span>
              </div>
            </div>
            <div className="cmp-col b">
              <div className="cmp-col-head">
                <b>Version B</b>
                <span className="cmp-tag b">forked</span>
              </div>
              <div className="cmp-field">
                <label>model</label>
                <div className="locked-val">{d.bModel}</div>
              </div>
              <div className="cmp-field">
                <label>temperature</label>
                <div className="locked-val">{d.bTemp}</div>
              </div>
              <div className="cmp-response">{d.bResponse ?? "—"}</div>
              <div className="cmp-stats">
                <span className="cmp-stat">
                  cost <b>${d.bCost.toFixed(5)}</b>
                </span>
                <span className="cmp-stat">
                  latency <b>{d.bLatency}ms</b>
                </span>
              </div>
            </div>
          </div>
          <div className="share-cta">
            <CtaButton router={router} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="share-shell">
        <p className="text-sm text-dim">Loading…</p>
      </div>
    </div>
  );
}

function CtaButton({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button type="button" className="btn primary ready share-cta" onClick={() => router.push("/campaigns")}>
      ⬡ Forge your own agent →
    </button>
  );
}

function downloadShareCert() {
  const canvas = document.querySelector<HTMLCanvasElement>(".cert-canvas-wrap canvas");
  if (!canvas) return;
  const a = document.createElement("a");
  a.download = "agent-forge-certificate.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}
