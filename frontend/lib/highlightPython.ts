function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KEYWORDS =
  "def|class|import|from|return|if|elif|else|for|while|in|not|and|or|is|" +
  "True|False|None|try|except|finally|with|as|pass|raise|async|await|lambda|yield";

const TOKEN_RE = new RegExp(
  `("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'` +
    `|#.*$|\\b(?:${KEYWORDS})\\b|\\b\\d+(?:\\.\\d+)?\\b)`,
  "gm"
);

/** Regex-based Python highlighter matching this repo's existing
 * highlightJson.ts pattern — no syntax-highlighting dependency, just
 * enough to color strings/comments/keywords/numbers for the code panel. */
export function highlightPython(code: string): string {
  const escaped = escapeHtml(code);
  return escaped.replace(TOKEN_RE, (match) => {
    let cls = "num";
    if (match.startsWith("#")) cls = "cmt";
    else if (/^["']/.test(match)) cls = "str";
    else if (/^\d/.test(match)) cls = "num";
    else cls = "kw";
    return `<span class="${cls}">${match}</span>`;
  });
}
