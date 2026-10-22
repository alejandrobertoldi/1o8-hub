/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useEffect, useRef, useState } from "react";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Phase = "idle" | "uploading" | "extracting";

type Stage = "parsing_pdf" | "extracting_md" | "extracting_summary" | "saving";

const STAGE_ORDER: Stage[] = ["parsing_pdf", "extracting_md", "extracting_summary", "saving"];

const STAGE_LABEL: Record<Stage, string> = {
  parsing_pdf: "Parsing PDF text",
  extracting_md: "Generating brand markdown (Claude)",
  extracting_summary: "Extracting structured summary (Claude)",
  saving: "Saving to database",
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  activeVersion: any | null;
  bg: any | null;
  onChange: () => Promise<void>;
}

interface UploadCallbacks {
  onPhase: (phase: Phase) => void;
  onProgress: (pct: number) => void;
}

function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Bad JSON from Drive")); }
      } else reject(new Error(`Drive PUT failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during Drive PUT"));
    xhr.send(file);
  });
}

async function uploadPdf(clientIdCode: string, file: File, cb: UploadCallbacks): Promise<void> {
  cb.onPhase("uploading");
  cb.onProgress(0);

  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientIdCode,
      folderType: "guidelines",
      mimeType: file.type || "application/pdf",
      fileName: file.name,
    }),
  });
  if (!sessionRes.ok) throw new Error(`upload-session failed: ${sessionRes.status}`);
  const sessionJson: { sessionUri: string; displayName: string; folderId: string } = await sessionRes.json();

  const driveResult = await putWithProgress(
    sessionJson.sessionUri,
    file,
    file.type || "application/pdf",
    cb.onProgress
  );

  cb.onPhase("extracting");

  const recordRes = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveFileId: driveResult.id,
      folderId: sessionJson.folderId,
      displayName: sessionJson.displayName,
      originalName: file.name,
      mimeType: file.type || "application/pdf",
      sizeBytes: file.size,
    }),
  });
  if (!recordRes.ok) {
    const body = await recordRes.text().catch(() => "");
    throw new Error(`/versions failed: ${recordRes.status} ${body}`);
  }
}

export default function BrandBookCard({ clientIdCode, canEdit, activeVersion, bg, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [polledStage, setPolledStage] = useState<Stage | null>(null);
  const [lastNonNullStage, setLastNonNullStage] = useState<Stage | null>(null);
  const [extractionStartedAt, setExtractionStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Poll the BG endpoint while extracting so we can surface the current stage.
  // The /versions POST stays in flight for the full 30-90s — this parallel GET
  // reads the row that runExtraction updates between steps.
  // 750ms cadence catches the short parsing_pdf stage (1-3s) reliably.
  useEffect(() => {
    if (phase !== "extracting") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines`, { cache: "no-store" });
        if (!r.ok) return;
        const json = await r.json();
        if (cancelled) return;
        const stage: Stage | null = json?.state?.extractionStage ?? null;
        setPolledStage(stage);
        if (stage) setLastNonNullStage(stage);
      } catch {
        // Network blip — try again next tick.
      }
    };
    tick();
    const id = setInterval(tick, 750);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase, clientIdCode]);

  // Tick once a second while extracting so the elapsed timer updates.
  useEffect(() => {
    if (phase !== "extracting") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Must be a PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setErr(`File too large (>${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB).`);
      return;
    }
    setBusy(true);
    try {
      await uploadPdf(clientIdCode, file, {
        onPhase: (p) => {
          setPhase(p);
          if (p === "extracting") setExtractionStartedAt(Date.now());
        },
        onProgress: setUploadPct,
      });
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPhase("idle");
      setUploadPct(0);
      setPolledStage(null);
      setLastNonNullStage(null);
      setExtractionStartedAt(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onReExtract() {
    if (!activeVersion) return;
    setBusy(true);
    setPhase("extracting");
    setExtractionStartedAt(Date.now());
    setLastNonNullStage(null);
    setErr(null);
    try {
      const r = await fetch(
        `/api/clients/${clientIdCode}/brand-guidelines/versions/${activeVersion.id}/re-extract`,
        { method: "POST" }
      );
      if (!r.ok) throw new Error(`re-extract failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPhase("idle");
      setPolledStage(null);
      setLastNonNullStage(null);
      setExtractionStartedAt(null);
    }
  }

  const status = bg?.extractionStatus ?? "idle";
  const driveUrl = activeVersion ? `https://drive.google.com/file/d/${activeVersion.driveFileId}/view` : null;

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <h2 className="font-medium">Active brand book</h2>
      {activeVersion ? (
        <div className="text-sm flex gap-4">
          {driveUrl && (
            <a
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 block w-40 h-24 rounded border overflow-hidden bg-muted hover:opacity-90 transition-opacity"
              title="Open PDF in Drive"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/drive-thumb/${activeVersion.driveFileId}?size=400`}
                alt={`${activeVersion.originalFilename} cover`}
                className="w-full h-full object-contain"
              />
            </a>
          )}
          <div className="flex-1 flex flex-col gap-1">
            <div>
              <span className="font-medium">{activeVersion.originalFilename}</span>
              {" · "}
              v{activeVersion.versionNumber}
              {" · uploaded "}
              {new Date(activeVersion.uploadedAt).toLocaleDateString()}
              {" by "}
              {activeVersion.uploadedBy}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {driveUrl && (
                <a
                  className="border px-3 py-1 rounded text-sm inline-flex items-center gap-1 hover:bg-muted"
                  href={driveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF in Drive <span aria-hidden>↗</span>
                </a>
              )}
              {canEdit && (
                <button className="border px-3 py-1 rounded text-sm disabled:opacity-50" disabled={busy} onClick={() => inputRef.current?.click()}>Replace</button>
              )}
              {canEdit && (
                <button className="border px-3 py-1 rounded text-sm disabled:opacity-50" disabled={busy} onClick={onReExtract}>Re-extract</button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">No brand book uploaded yet.</p>
          {canEdit && (
            <button className="border px-3 py-1 rounded text-sm w-fit disabled:opacity-50" disabled={busy} onClick={() => inputRef.current?.click()}>Upload PDF</button>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickFile} />
      {(busy || status === "extracting") && (
        <div className="flex flex-col gap-2">
          {phase === "uploading" && (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading PDF to Drive — {uploadPct}%</span>
                <span className="font-mono tabular-nums">{uploadPct}%</span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-brand transition-[width] duration-150 ease-out"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </>
          )}
          {(phase === "extracting" || (phase === "idle" && status === "extracting")) && (() => {
            // displayStage falls back to a sensible step when polling sees null:
            //   - before any stage was ever seen → step 1 (parsing_pdf)
            //   - after we saw extracting_summary and stage went null while
            //     the API call is still pending → step 4 (saving)
            //   - otherwise hold the last seen stage so the bar doesn't disappear
            const displayStage: Stage | null = polledStage ?? (
              !lastNonNullStage
                ? "parsing_pdf"
                : lastNonNullStage === "extracting_summary"
                ? "saving"
                : lastNonNullStage
            );
            const currentIdx = displayStage ? STAGE_ORDER.indexOf(displayStage) : -1;
            const elapsed = extractionStartedAt ? now - extractionStartedAt : 0;
            return (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {displayStage
                      ? `${STAGE_LABEL[displayStage]} — step ${currentIdx + 1} of ${STAGE_ORDER.length}`
                      : "Starting extraction…"}
                  </span>
                  {extractionStartedAt && (
                    <span className="font-mono tabular-nums">{formatElapsed(elapsed)} elapsed</span>
                  )}
                </div>
                <ol className="flex flex-col gap-1 text-xs">
                  {STAGE_ORDER.map((s, i) => {
                    const done = currentIdx > i;
                    const active = currentIdx === i;
                    return (
                      <li key={s} className="flex items-center gap-2">
                        <span
                          className={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] ${
                            done
                              ? "bg-brand-solid text-white border-brand-solid"
                              : active
                              ? "border-brand text-brand"
                              : "border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span className={done ? "text-muted-foreground line-through" : active ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {STAGE_LABEL[s]}
                        </span>
                        {active && (
                          <span className="ml-1 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-muted relative">
                            <span className="absolute inset-y-0 left-0 h-full w-1/3 animate-progress-shimmer rounded-full bg-brand" />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="text-[11px] text-muted-foreground">
                  Typical run: 30-90s. The Claude steps can take up to a minute each on long brand books.
                </div>
              </>
            );
          })()}
        </div>
      )}
      {status === "failed" && (
        <div className="text-sm text-red-600">Extraction failed: {bg?.lastExtractionError ?? "unknown error"}. Try Re-extract.</div>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </section>
  );
}
