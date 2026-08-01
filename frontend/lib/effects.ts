export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function confettiBurst(count: number) {
  if (reducedMotion()) return;
  const colors = ["var(--color-violet)", "var(--color-violet-hi)", "var(--color-plasma)", "var(--color-spring)", "var(--color-amber)"];
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.style.position = "fixed";
    c.style.top = "-10px";
    c.style.zIndex = "230";
    c.style.width = "9px";
    c.style.height = "14px";
    c.style.pointerEvents = "none";
    c.style.borderRadius = "2px";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length]!;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(c);
    const dur = 1400 + Math.random() * 1200;
    const drift = (Math.random() - 0.5) * 280;
    c.animate(
      [
        { transform: `translate(0,0) rotate(0)`, opacity: 1 },
        {
          transform: `translate(${drift}px,105vh) rotate(${Math.random() * 720}deg)`,
          opacity: 0.9,
        },
      ],
      { duration: dur, easing: "cubic-bezier(.3,.6,.5,1)" }
    );
    setTimeout(() => c.remove(), dur);
  }
}

export function spawnXpFly(fromEl: HTMLElement, text: string) {
  if (reducedMotion()) return;
  const target = document.getElementById("xp-fill-target");
  if (!target) return;
  const r = fromEl.getBoundingClientRect();
  const hud = target.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.style.position = "fixed";
  fly.style.zIndex = "210";
  fly.style.fontFamily = "var(--font-mono, monospace)";
  fly.style.fontWeight = "700";
  fly.style.fontSize = "15px";
  fly.style.color = "var(--color-violet-hi)";
  fly.style.pointerEvents = "none";
  fly.style.textShadow = "0 0 12px rgba(var(--color-violet-rgb)/.8)";
  fly.textContent = text;
  fly.style.left = r.left + r.width / 2 + "px";
  fly.style.top = r.top + "px";
  document.body.appendChild(fly);
  fly.animate(
    [
      { transform: "translate(-50%,0) scale(1)", opacity: 1 },
      {
        transform: `translate(${hud.left - r.left - r.width / 2}px,${
          hud.top - r.top - 40
        }px) scale(.7)`,
        opacity: 0,
      },
    ],
    { duration: 900, easing: "cubic-bezier(.4,0,.2,1)" }
  );
  setTimeout(() => fly.remove(), 950);
}

export interface ToastDetail {
  xpText: string;
  msg: string;
}

export function showToast(xpText: string, msg: string) {
  window.dispatchEvent(
    new CustomEvent<ToastDetail>("forge:toast", { detail: { xpText, msg } })
  );
}

export function triggerLevelUp(rank: string) {
  window.dispatchEvent(new CustomEvent<string>("forge:levelup", { detail: rank }));
  confettiBurst(30);
}
