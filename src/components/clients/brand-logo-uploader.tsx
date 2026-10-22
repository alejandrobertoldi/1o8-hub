/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useRef, useState } from "react";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  bg: any | null;
  logoFiles: any[];
  onChange: () => Promise<void>;
}

const SLOTS = ["primary", "secondary", "monochrome"] as const;
type Slot = (typeof SLOTS)[number];
type AnySlot = Slot | "additional";

function driveFileIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.split("/d/")[1]?.split("/")[0] ?? null;
}

function thumbUrl(driveFileId: string, size = 400): string {
  return `/api/drive-thumb/${driveFileId}?size=${size}`;
}

async function uploadLogo(
  clientIdCode: string,
  slot: AnySlot,
  file: File,
  label?: string,
): Promise<void> {
  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientIdCode,
      folderType: "client_logos",
      mimeType: file.type || "image/png",
      fileName: file.name,
      imageSlot: `logo_${slot}`,
    }),
  });
  if (!sessionRes.ok) throw new Error(`upload-session failed: ${sessionRes.status}`);
  const session: { sessionUri: string; displayName: string; folderId: string } = await sessionRes.json();

  const putRes = await fetch(session.sessionUri, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Drive PUT failed: ${putRes.status}`);
  const driveResult: { id: string } = await putRes.json();

  const recordRes = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/logo-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveFileId: driveResult.id,
      folderId: session.folderId,
      displayName: session.displayName,
      originalName: file.name,
      mimeType: file.type || "image/png",
      sizeBytes: file.size,
      slot,
      ...(slot === "additional" && label ? { label } : {}),
    }),
  });
  if (!recordRes.ok) throw new Error(`logo-files POST failed: ${recordRes.status}`);
}

export default function BrandLogoUploader({ clientIdCode, canEdit, bg, logoFiles, onChange }: Props) {
  const refs = useRef<Record<Slot, HTMLInputElement | null>>({ primary: null, secondary: null, monochrome: null });
  const additionalInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<AnySlot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const logo: any = bg?.summary?.logo ?? bg?.summaryLogo ?? null;

  // Drive file IDs already bound to the 3 named slots — used to filter
  // the additional-logos gallery so we don't double-show them.
  const slotDriveIds = new Set(
    SLOTS
      .map((s) => driveFileIdFromUrl(logo?.[`${s}_url`]))
      .filter((id): id is string => Boolean(id))
  );
  const additionalLogos = (logoFiles ?? []).filter(
    (f) => f.entityType === "brand_logo" && !slotDriveIds.has(f.driveFileId)
  );

  function startEdit() {
    setEditing(true);
    setDraft(JSON.stringify(logo ?? {
      primary_description: null, secondary_description: null, monochrome_description: null,
      clearspace_notes: null, misuse_notes: null,
      primary_url: null, secondary_url: null, monochrome_url: null,
    }, null, 2));
    setErr(null);
  }

  async function saveEdit() {
    setSaveBusy(true);
    setErr(null);
    try {
      const parsed = JSON.parse(draft);
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: parsed }),
      });
      if (!r.ok) throw new Error(`save failed: ${r.status}`);
      await onChange();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }

  async function onPick(slot: Slot, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (file.size > MAX_LOGO_BYTES) {
      setErr(`Logo too large (>${MAX_LOGO_BYTES / 1024 / 1024}MB).`);
      return;
    }
    setBusy(slot);
    try {
      await uploadLogo(clientIdCode, slot, file);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      const ref = refs.current[slot];
      if (ref) ref.value = "";
    }
  }

  async function onPickAdditional(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const label = addLabel.trim();
    if (!file) return;
    setErr(null);
    if (!label) {
      setErr("Enter a name for the logo before picking the file.");
      if (additionalInputRef.current) additionalInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErr(`Logo too large (>${MAX_LOGO_BYTES / 1024 / 1024}MB).`);
      return;
    }
    setBusy("additional");
    try {
      await uploadLogo(clientIdCode, "additional", file, label);
      setAddLabel("");
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (additionalInputRef.current) additionalInputRef.current.value = "";
    }
  }

  async function onDelete(slot: Slot) {
    const url: string | null = logo?.[`${slot}_url`] ?? null;
    if (!url) return;
    const driveFileId = driveFileIdFromUrl(url);
    if (!driveFileId) return;
    setBusy(slot);
    setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/logo-files/${driveFileId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteAdditional(driveFileId: string) {
    setRemovingId(driveFileId);
    setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/logo-files/${driveFileId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="border rounded p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Logo</h2>
        {canEdit && !editing && (
          <button className="text-xs underline" onClick={startEdit}>Edit JSON</button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            className="border rounded p-2 text-xs font-mono h-64"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="border px-2 py-1 rounded text-xs disabled:opacity-50"
              disabled={saveBusy}
              onClick={saveEdit}
            >
              Save
            </button>
            <button
              className="border px-2 py-1 rounded text-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {SLOTS.map((slot) => {
              const url: string | null = logo?.[`${slot}_url`] ?? null;
              const description: string | null = logo?.[`${slot}_description`] ?? null;
              const driveFileId = driveFileIdFromUrl(url);
              return (
                <div key={slot} className="border rounded p-3 flex flex-col md:flex-row gap-3">
                  <div className="md:w-40 flex flex-col gap-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{slot}</div>
                    {driveFileId && url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block size-32 rounded border overflow-hidden bg-muted hover:opacity-90 transition-opacity"
                        title={`Open ${slot} logo in Drive`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(driveFileId)}
                          alt={`${slot} logo`}
                          className="w-full h-full object-contain bg-white"
                          referrerPolicy="no-referrer"
                        />
                      </a>
                    ) : (
                      <div className="size-32 rounded border bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                        no file
                      </div>
                    )}
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                          disabled={busy === slot}
                          onClick={() => refs.current[slot]?.click()}
                        >
                          {busy === slot ? "Uploading…" : url ? "Replace" : "Upload"}
                        </button>
                        {url && (
                          <button
                            className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                            disabled={busy === slot}
                            onClick={() => onDelete(slot)}
                          >
                            Remove
                          </button>
                        )}
                        <input
                          ref={(el) => { refs.current[slot] = el; }}
                          type="file"
                          accept="image/png,image/svg+xml,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => onPick(slot, e)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="text-sm">
                      {description ?? <span className="text-muted-foreground">No description</span>}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline inline-flex items-center gap-1 w-fit"
                      >
                        Open in Drive <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(logo?.clearspace_notes || logo?.misuse_notes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border-t pt-3">
              {logo?.clearspace_notes && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Clearspace</div>
                  <div>{logo.clearspace_notes}</div>
                </div>
              )}
              {logo?.misuse_notes && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Misuse</div>
                  <div>{logo.misuse_notes}</div>
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-3 flex flex-col gap-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Additional logos
            </div>
            {additionalLogos.length === 0 && !canEdit && (
              <div className="text-xs text-muted-foreground">None.</div>
            )}
            {additionalLogos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {additionalLogos.map((f) => {
                  const url = `https://drive.google.com/file/d/${f.driveFileId}/view`;
                  return (
                    <div key={f.driveFileId} className="border rounded p-2 flex flex-col gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full aspect-square rounded border overflow-hidden bg-muted hover:opacity-90 transition-opacity"
                        title={`Open ${f.displayName} in Drive`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(f.driveFileId)}
                          alt={f.displayName}
                          className="w-full h-full object-contain bg-white"
                          referrerPolicy="no-referrer"
                        />
                      </a>
                      <div className="text-xs truncate" title={f.displayName}>
                        {f.displayName}
                      </div>
                      {canEdit && (
                        <button
                          className="border px-2 py-1 rounded text-[11px] disabled:opacity-50"
                          disabled={removingId === f.driveFileId}
                          onClick={() => onDeleteAdditional(f.driveFileId)}
                        >
                          {removingId === f.driveFileId ? "Removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Logo name (e.g. Wordmark, Icon, Holiday)"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  className="border rounded px-2 py-1 text-xs flex-1 min-w-[180px]"
                  maxLength={100}
                />
                <button
                  className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                  disabled={busy === "additional" || !addLabel.trim()}
                  onClick={() => additionalInputRef.current?.click()}
                >
                  {busy === "additional" ? "Uploading…" : "Add logo"}
                </button>
                <input
                  ref={additionalInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickAdditional}
                />
              </div>
            )}
          </div>
        </>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}
    </section>
  );
}
