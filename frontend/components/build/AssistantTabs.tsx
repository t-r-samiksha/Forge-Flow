"use client";

const TAB_LABELS = ["Trade-offs", "Pitfalls", "Docs"];

interface AssistantTabsProps {
  tabs: [string, string, string];
  active: number;
  onChange: (i: number) => void;
}

export default function AssistantTabs({ tabs, active, onChange }: AssistantTabsProps) {
  return (
    <div className="rounded-2xl border border-line p-[26px]" style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}>
      <div className="mb-3 flex gap-1">
        {TAB_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(i)}
            className={`flex-1 rounded-lg border px-1.5 py-2 text-center font-mono text-[10.5px] transition-all ${
              active === i
                ? "border-[rgba(var(--color-violet-rgb)/.3)] bg-violet-dim text-violet-hi"
                : "border-transparent text-dim hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        key={active}
        className="text-[12.5px] leading-[1.6] text-dim [&_b]:text-text [&_code]:rounded [&_code]:bg-panel-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-plasma [&_em]:not-italic [&_em]:text-violet-hi"
        style={{ animation: "fadein .3s" }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: tabs[active] }}
      />
    </div>
  );
}
