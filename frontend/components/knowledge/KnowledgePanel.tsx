"use client";

import { useEffect, useState } from "react";
import { deleteKnowledgeDoc, listKnowledgeDocs, type KnowledgeDoc } from "@/lib/api";
import KnowledgeUploadForm from "./KnowledgeUploadForm";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function KnowledgePanel({ agentId }: { agentId: string }) {
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = () => {
    listKnowledgeDocs(agentId)
      .then((rows) => {
        setDocs(rows);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load knowledge docs."));
  };

  useEffect(refresh, [agentId]);

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await deleteKnowledgeDoc(agentId, docId);
      setDocs((prev) => (prev ? prev.filter((d) => d.id !== docId) : prev));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't delete that document.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">Knowledge</div>
      <h3 className="mb-4 font-display text-lg font-semibold">
        Docs this agent retrieves from before answering
      </h3>

      {loadError && <p className="mb-3 font-mono text-xs text-rose">⚠ {loadError}</p>}

      {docs === null && !loadError ? (
        <p className="font-mono text-xs text-mute">Loading…</p>
      ) : docs && docs.length === 0 ? (
        <p className="font-mono text-xs text-mute">
          No documents ingested yet — this agent answers from its instructions alone.
        </p>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          {docs?.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-code-bg px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-[12.5px] text-text">{doc.filename}</div>
                <div className="font-mono text-[10.5px] text-mute">
                  {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"} · uploaded {formatDate(doc.uploadedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="flex-none rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-rose transition-colors hover:border-rose disabled:opacity-50"
              >
                {deletingId === doc.id ? "…" : "🗑 Delete"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showUpload ? (
        <div className="rounded-lg border border-line p-4">
          <KnowledgeUploadForm
            agentId={agentId}
            onUploaded={() => {
              refresh();
              setShowUpload(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-text transition-colors hover:border-violet hover:text-violet-hi"
        >
          + Add document
        </button>
      )}
    </div>
  );
}
