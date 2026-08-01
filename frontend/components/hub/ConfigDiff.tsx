"use client";

interface ConfigDiffProps {
  original: string;
  current: string;
  label: string;
}

export default function ConfigDiff({ original, current, label }: ConfigDiffProps) {
  const changed = original !== current;

  return (
    <div className="mt-2 rounded-lg border border-line bg-panel-3 px-3 py-2 font-mono text-[11px]">
      {!changed ? (
        <span className="text-mute">No changes yet</span>
      ) : (
        <div className="space-y-1" style={{ animation: "clinein .3s ease forwards" }}>
          <div className="text-rose">
            − {label}: &quot;{original || "—"}&quot; <span className="text-mute">(original)</span>
          </div>
          <div className="text-spring">
            + {label}: &quot;{current || "—"}&quot; <span className="text-mute">(current)</span>
          </div>
        </div>
      )}
    </div>
  );
}
