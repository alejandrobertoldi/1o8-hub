"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, History, Italic, List, ListOrdered, Loader2, RotateCcw, Save, Sparkles, TriangleAlert } from "lucide-react";
import type { TextVersion } from "@/lib/client-report/texts-store";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = { ai: "Claude draft", ai_rewrite: "Claude rewrite", edit: "Edited", restore: "Restored" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * One written block of the report, editable in place on the paper: basic
 * formatting, save as a new version, ask Claude to rewrite it, and restore an
 * older version. Colors are fixed (the paper is always light).
 */
export function ReportTextEditor({
  label,
  html,
  versions,
  warnings,
  canEdit,
  onSave,
  onRewrite,
  onRestore,
}: {
  label: string;
  html: string;
  versions: TextVersion[];
  warnings?: string[];
  canEdit: boolean;
  onSave: (html: string) => Promise<void>;
  onRewrite: (instruction: string) => Promise<void>;
  onRestore: (versionId: string) => Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "rewrite" | "restore">(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "rewrite" | "history">(null);
  const [instruction, setInstruction] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } }),
    ],
    content: html,
    editable: canEdit,
    immediatelyRender: false,
    editorProps: { attributes: { class: "cr-editor outline-none", "aria-label": label } },
    onUpdate: () => setDirty(true),
  });
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive("bold"),
      italic: !!e?.isActive("italic"),
      bullet: !!e?.isActive("bulletList"),
      ordered: !!e?.isActive("orderedList"),
    }),
  });

  // A new version from the server (rewrite, restore, refresh) replaces the text unless there are unsaved edits.
  useEffect(() => {
    if (editor && !dirty && editor.getHTML() !== html) editor.commands.setContent(html || "", { emitUpdate: false });
  }, [editor, html, dirty]);

  const run = async (kind: "save" | "rewrite" | "restore", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      if (kind !== "save") setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-1 rounded border border-[#d8d7dc] bg-white px-1.5 py-0.5 text-[11px] text-[#2c2b35] hover:bg-[#f4f4f2] disabled:opacity-40";
  const on = "bg-[#2c2b35] text-[#f7bf1d] hover:bg-[#2c2b35]";
  const past = [...versions].reverse();

  return (
    <div className="cr-editing">
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#6e6c77]">{label}</span>
        {canEdit && editor && (
          <>
            <button type="button" className={cn(btn, marks?.bold && on)} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
              <Bold className="size-3" />
            </button>
            <button type="button" className={cn(btn, marks?.italic && on)} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
              <Italic className="size-3" />
            </button>
            <button type="button" className={cn(btn, marks?.bullet && on)} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">
              <List className="size-3" />
            </button>
            <button type="button" className={cn(btn, marks?.ordered && on)} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">
              <ListOrdered className="size-3" />
            </button>
            <span className="mx-1 h-4 w-px bg-[#d8d7dc]" />
            <button type="button" className={cn(btn, panel === "rewrite" && on)} onClick={() => setPanel(panel === "rewrite" ? null : "rewrite")} disabled={!!busy}>
              <Sparkles className="size-3" /> Rewrite with AI
            </button>
          </>
        )}
        <button type="button" className={cn(btn, panel === "history" && on)} onClick={() => setPanel(panel === "history" ? null : "history")} disabled={!versions.length}>
          <History className="size-3" /> {versions.length} version{versions.length === 1 ? "" : "s"}
        </button>
        {canEdit && dirty && (
          <button type="button" className={cn(btn, "ml-auto border-[#2c2b35] bg-[#f7bf1d] font-semibold hover:bg-[#f7bf1d]")} disabled={!!busy} onClick={() => editor && run("save", async () => { await onSave(editor.getHTML()); setDirty(false); })}>
            {busy === "save" ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Save
          </button>
        )}
      </div>

      {panel === "rewrite" && (
        <form
          className="mb-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("rewrite", async () => {
              await onRewrite(instruction);
              setInstruction("");
              setPanel(null);
            });
          }}
        >
          <input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional: what to change (shorter, mention the BFCM launch…)"
            className="h-7 flex-1 rounded border border-[#d8d7dc] bg-white px-2 text-[11.5px] text-[#2c2b35] outline-none focus:border-[#2c2b35]"
          />
          <button type="submit" className={cn(btn, "px-2 font-semibold")} disabled={!!busy}>
            {busy === "rewrite" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            {busy === "rewrite" ? "Writing…" : dirty ? "Rewrite (drops unsaved edits)" : "Rewrite"}
          </button>
        </form>
      )}

      {panel === "history" && (
        <ul className="mb-2 max-h-48 divide-y divide-[#e4e3e7] overflow-y-auto rounded border border-[#e4e3e7] bg-white text-[11px] text-[#2c2b35]">
          {past.map((v, i) => (
            <li key={v.id} className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {SOURCE_LABEL[v.source] ?? v.source} · {when(v.createdAt)}
                  {v.createdBy && <span className="font-normal text-[#6e6c77]"> · {v.createdBy}</span>}
                  {i === 0 && <span className="ml-1 rounded bg-[#f4f4f2] px-1 text-[10px] font-normal">current</span>}
                </div>
                {v.instruction && <div className="text-[#6e6c77]">“{v.instruction}”</div>}
                <div className="truncate text-[#6e6c77]">{v.html.replace(/<[^>]+>/g, " ").slice(0, 160)}</div>
              </div>
              {canEdit && i > 0 && (
                <button type="button" className={btn} disabled={!!busy} onClick={() => run("restore", async () => { await onRestore(v.id); setPanel(null); })}>
                  <RotateCcw className="size-3" /> Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={cn("relative rounded", canEdit && "ring-1 ring-transparent hover:ring-[#d8d7dc] focus-within:ring-[#2c2b35]", busy === "rewrite" && "opacity-40")}>
        {!html && !dirty && <p className="pointer-events-none absolute left-0 top-0 text-[#9b99a3]">Nothing written yet.</p>}
        <EditorContent editor={editor} />
      </div>

      {warnings && warnings.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1 text-[10.5px] text-[#b4531f]">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          Check these figures, they don&apos;t match the report&apos;s numbers: {warnings.join(", ")}
        </p>
      )}
      {error && <p className="mt-1 text-[10.5px] text-[#c8412f]">{error}</p>}
    </div>
  );
}
