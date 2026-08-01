"use client";

import { useRef, useState } from "react";
import { uploadKnowledge, type KnowledgeDoc } from "@/lib/api";

type Mode = "file" | "paste";
type Status = "idle" | "reading" | "uploading" | "success" | "error";

interface KnowledgeUploadFormProps {
  agentId: string;
  /** Fires after a successful ingest — parent decides whether to refresh
   * a list, show a toast, etc. The form's own success message is enough
   * feedback on its own, so this is optional. */
  onUploaded?: (doc: KnowledgeDoc) => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export default function KnowledgeUploadForm({ agentId, onUploaded }: KnowledgeUploadFormProps) {
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pastedName, setPastedName] = useState("pasted-notes.txt");
  const [pastedText, setPastedText] = useState("");
  const [topK, setTopK] = useState(4);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<KnowledgeDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPdf = !!file && file.name.toLowerCase().endsWith(".pdf");

  const pickFile = (f: File | null) => {
    setFile(f);
    setStatus("idle");
    setErrorMsg(null);
  };

  const submit = async () => {
    setErrorMsg(null);
    let filename: string;
    let content: string;

    if (mode === "file") {
      if (!file || isPdf) return;
      setStatus("reading");
      try {
        content = await readFileAsText(file);
      } catch {
        setStatus("error");
        setErrorMsg("Couldn't read that file.");
        return;
      }
      filename = file.name;
    } else {
      content = pastedText.trim();
      filename = pastedName.trim() || "pasted-notes.txt";
    }

    if (!content.trim()) {
      setStatus("error");
      setErrorMsg("There's no text to ingest yet.");
      return;
    }

    setStatus("uploading");
    try {
      const doc = await uploadKnowledge(agentId, { filename, content, topK });
      setStatus("success");
      setLastUploaded(doc);
      setFile(null);
      setPastedText("");
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.(doc);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const busy = status === "reading" || status === "uploading";
  const canSubmit = mode === "file" ? !!file && !isPdf : !!pastedText.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 font-mono text-[11px]">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-full border px-3 py-1.5 transition-colors ${
            mode === "file"
              ? "border-violet bg-[rgba(var(--color-violet-rgb)/.12)] text-violet-hi"
              : "border-line text-mute hover:text-text"
          }`}
        >
          📄 Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-full border px-3 py-1.5 transition-colors ${
            mode === "paste"
              ? "border-violet bg-[rgba(var(--color-violet-rgb)/.12)] text-violet-hi"
              : "border-line text-mute hover:text-text"
          }`}
        >
          ✎ Paste text
        </button>
      </div>

      {mode === "file" ? (
        <div
          key="file-mode"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-violet bg-[rgba(var(--color-violet-rgb)/.06)]" : "border-line bg-code-bg"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="font-mono text-[13px] text-text">
              📎 {file.name} <span className="text-mute">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
            </p>
          ) : (
            <p className="font-mono text-[12px] text-mute">
              Drop a .txt, .md, .csv, or .pdf file here, or click to browse
            </p>
          )}
        </div>
      ) : (
        <div key="paste-mode" className="flex flex-col gap-2">
          <input
            type="text"
            value={pastedName}
            onChange={(e) => setPastedName(e.target.value)}
            placeholder="source-name.txt"
            className="rounded-lg border border-line bg-code-bg px-3 py-2 font-mono text-[12px] text-text outline-none focus:border-violet"
          />
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={6}
            placeholder="Paste raw text to ground this agent's answers in…"
            className="w-full resize-y rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-violet"
          />
        </div>
      )}

      {isPdf && (
        <p className="font-mono text-[11.5px] text-amber">
          ⚠ PDF text extraction isn&apos;t wired up yet — paste the text instead, or upload a .txt/.md/.csv.
        </p>
      )}

      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] text-mute">top_k</label>
        <input
          type="number"
          min={1}
          max={20}
          value={topK}
          onChange={(e) => setTopK(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className="w-16 rounded-lg border border-line bg-code-bg px-2 py-1.5 font-mono text-[12px] text-text outline-none focus:border-violet"
        />
        <span className="font-mono text-[10.5px] text-mute">chunks retrieved per query</span>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy || !canSubmit}
        className="self-start rounded-lg bg-violet px-4 py-2 font-mono text-xs font-semibold text-on-accent transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {status === "reading" ? "Reading…" : status === "uploading" ? "Chunking + embedding…" : "⬆ Add to knowledge base"}
      </button>

      {status === "error" && errorMsg && <p className="font-mono text-[11.5px] text-rose">⚠ {errorMsg}</p>}
      {status === "success" && lastUploaded && (
        <p className="font-mono text-[11.5px] text-spring">
          ✓ {lastUploaded.filename} ingested — {lastUploaded.chunkCount} chunk
          {lastUploaded.chunkCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
