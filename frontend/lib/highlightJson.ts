function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "key" : "str";
      } else if (/^(true|false|null)$/.test(match)) {
        cls = "kw";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
