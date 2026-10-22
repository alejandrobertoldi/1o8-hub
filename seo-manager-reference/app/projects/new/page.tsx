/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !brandName.trim()) return;
    setLoading(true);

    // TODO: Create project in Supabase
    // For now, redirect to a demo project
    const id = "new-" + Date.now();
    router.push(`/projects/${id}/intake`);
  };

  return (
    <div className="px-8 py-6">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-zinc-100">
          New Project
        </h1>

        <div className="space-y-4 rounded-xl border border-surface-4 bg-surface-1 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-zinc-400">
              Project Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Cuddles — ReadyRESCUE"
              className="w-full rounded-lg border border-surface-4 bg-surface-0 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-zinc-400">
              Brand Name <span className="text-accent-red">*</span>
            </label>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Dr. Cuddles"
              className="w-full rounded-lg border border-surface-4 bg-surface-0 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-zinc-600">
              This is the authoritative brand name for all ASINs. Same as INTAKE cell A4.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-surface-4 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !brandName.trim() || loading}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-surface-0 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {loading ? "Creating…" : "Create Project → Start Intake"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
