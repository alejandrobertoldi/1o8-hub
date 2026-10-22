"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { Fragment, useState } from "react";

interface Version {
  id: string;
  versionNumber: number;
  originalFilename: string;
  uploadedBy: string;
  uploadedAt: string;
  archivedAt: string | null;
  driveFileId: string;
  pageCount: number | null;
}

export default function BrandVersionHistory({
  versions,
  clientIdCode,
}: {
  versions: Version[];
  clientIdCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);
  const [previewMd, setPreviewMd] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);

  async function togglePreview(versionId: string) {
    if (previewOpenId === versionId) {
      setPreviewOpenId(null);
      return;
    }
    if (!previewMd[versionId]) {
      setPreviewBusy(versionId);
      try {
        const r = await fetch(
          `/api/clients/${clientIdCode}/brand-guidelines/versions/${versionId}/ai-preview`
        );
        const text = r.ok ? await r.text() : `(error: ${r.status})`;
        setPreviewMd((prev) => ({ ...prev, [versionId]: text }));
      } finally {
        setPreviewBusy(null);
      }
    }
    setPreviewOpenId(versionId);
  }

  return (
    <section className="border rounded p-4">
      <button className="font-medium flex items-center gap-2" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▼" : "▶"}</span>
        Version history ({versions.length})
      </button>
      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="text-sm w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-1 pr-3">v</th>
                <th className="py-1 pr-3">Filename</th>
                <th className="py-1 pr-3">Uploaded</th>
                <th className="py-1 pr-3">By</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Pages</th>
                <th className="py-1 pr-3">File</th>
                <th className="py-1 pr-3">AI preview</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const isOpen = previewOpenId === v.id;
                const md = previewMd[v.id];
                return (
                  <Fragment key={v.id}>
                    <tr className="border-t">
                      <td className="py-1 pr-3">{v.versionNumber}</td>
                      <td className="py-1 pr-3">{v.originalFilename}</td>
                      <td className="py-1 pr-3">{new Date(v.uploadedAt).toLocaleString()}</td>
                      <td className="py-1 pr-3">{v.uploadedBy}</td>
                      <td className="py-1 pr-3">{v.archivedAt ? "archived" : "active"}</td>
                      <td className="py-1 pr-3">{v.pageCount ?? "—"}</td>
                      <td className="py-1 pr-3">
                        <a
                          className="underline"
                          href={`https://drive.google.com/file/d/${v.driveFileId}/view`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      </td>
                      <td className="py-1 pr-3">
                        <button
                          className="text-xs underline disabled:opacity-50"
                          disabled={previewBusy === v.id}
                          onClick={() => togglePreview(v.id)}
                        >
                          {previewBusy === v.id ? "Loading…" : isOpen ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-muted/30 px-3 py-2">
                          <pre className="text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">
                            {md && md.length > 0
                              ? md
                              : "(no AI preview stored for this version yet — re-extract or edit summary/notes to populate it)"}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
