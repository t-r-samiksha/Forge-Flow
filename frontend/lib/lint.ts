export interface LintResult {
  ok: boolean;
  warn?: boolean;
  icon: string;
  msg: string;
  loc: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function lint(node: string, rawVal: string): LintResult {
  const v = (rawVal || "").trim();
  switch (node) {
    case "agent_name": {
      if (v.length < 2) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "agent name is too short — this is what ships to Lyzr and shows up everywhere the agent talks.",
          loc: "agent.py:5",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `agent named &rarr; <b>${escapeHtml(v)}</b>`,
        loc: "agent.py:5",
      };
    }
    case "model": {
      const short = v.replace("gemini-2.5-", "");
      return {
        ok: true,
        icon: "✓",
        msg: `model resolved &rarr; <b>${escapeHtml(short)}</b>`,
        loc: "agent.py:6",
      };
    }
    case "instr": {
      if (v.length < 12) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "instruction is thin — the agent may hallucinate. try grounding it in the context.",
          loc: "agent.py:7",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `instruction accepted &rarr; <b>${v.length} chars</b>, well-grounded`,
        loc: "agent.py:7",
      };
    }
    case "temp": {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "temperature must be between 0.0 and 1.0",
          loc: "agent.py:8",
        };
      }
      const style = num <= 0.3 ? "deterministic" : num <= 0.7 ? "balanced" : "creative";
      return {
        ok: true,
        icon: "✓",
        msg: `temperature ${num} &rarr; <b>${style}</b> outputs`,
        loc: "agent.py:8",
      };
    }
    case "qdr":
      return {
        ok: true,
        icon: "✓",
        msg: `collection bound &rarr; <b>"${escapeHtml(v)}"</b>`,
        loc: "agent.py:7",
      };
    case "ret": {
      const k = parseInt(v, 10);
      if (isNaN(k) || k < 1) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "top_k must be a positive integer",
          loc: "agent.py:8",
        };
      }
      if (k > 8) {
        return {
          ok: true,
          warn: true,
          icon: "⚠",
          msg: `top_k ${k} is high — may flood the prompt with noise. 3-5 is safer.`,
          loc: "agent.py:8",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `retrieval set &rarr; <b>${k} chunks</b> per query`,
        loc: "agent.py:8",
      };
    }
    case "tool_name": {
      if (v.length < 2 || /\s/.test(v)) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "tool name should be a short snake_case identifier — no spaces.",
          loc: "tools.py:4",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `tool registered &rarr; <b>${escapeHtml(v)}</b>`,
        loc: "tools.py:4",
      };
    }
    case "tool_desc": {
      if (v.length < 16) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "description is thin — the router decides which tool to call from this text alone. be specific about when to use it.",
          loc: "tools.py:6",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `description accepted &rarr; <b>${v.length} chars</b>, routable`,
        loc: "tools.py:6",
      };
    }
    case "auth": {
      if (v.length < 3) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "auth header/env var name looks too short to be real.",
          loc: "tools.py:9",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `credential wired &rarr; <b>${escapeHtml(v)}</b> read from env, never hardcoded`,
        loc: "tools.py:9",
      };
    }
    case "router_instr": {
      if (v.length < 20) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "routing instruction is thin — the agent needs clear criteria to pick the right tool.",
          loc: "agent.py:9",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: `routing logic accepted &rarr; <b>${v.length} chars</b>, decision-ready`,
        loc: "agent.py:9",
      };
    }
    case "fallback": {
      const hasEscalation = /human|escalat|support|unsure|don't know|dont know/i.test(v);
      if (v.length < 10) {
        return {
          ok: false,
          warn: true,
          icon: "⚠",
          msg: "no fallback defined — an unmatched request will fail silently instead of escalating.",
          loc: "agent.py:11",
        };
      }
      if (!hasEscalation) {
        return {
          ok: true,
          warn: true,
          icon: "⚠",
          msg: "fallback is set but doesn't mention escalating to a human — consider adding one.",
          loc: "agent.py:11",
        };
      }
      return {
        ok: true,
        icon: "✓",
        msg: "fallback set &rarr; <b>unmatched requests escalate</b> instead of failing silently",
        loc: "agent.py:11",
      };
    }
    default:
      return { ok: true, icon: "✓", msg: "ok", loc: "" };
  }
}
