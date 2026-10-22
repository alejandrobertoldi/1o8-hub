/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useState, useEffect } from "react";

export interface ProjectData {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  current_phase: string;
  date?: string;
  client_id_code?: string;
  client_name?: string;
  client_bible_url?: string;
  brand_url?: string;
  competitors?: any[];
  variation_theme?: string;
  size_present?: boolean;
  brand_guidelines_lock?: any;
  s1_approved_at?: string | null;
  s2_approved_at?: string | null;
  s3_approved_at?: string | null;
  s4_approved_at?: string | null;
  s5_approved_at?: string | null;
  s6_approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  asins?: any[];
}

const MOCK_PROJECT: ProjectData = {
  id: "demo-1",
  name: "Dr. Cuddles — ReadyRESCUE",
  brand_name: "Dr. Cuddles",
  status: "in_progress",
  current_phase: "S4",
  s1_approved_at: "2026-02-21T01:00:00Z",
  s2_approved_at: "2026-02-21T02:00:00Z",
  s3_approved_at: "2026-02-23T01:00:00Z",
  s4_approved_at: null,
  s5_approved_at: null,
  s6_approved_at: null,
  competitors: [],
  asins: [],
};

export function useProject(projectId: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // Try Supabase first
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setProject(data);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // Fallback to mock for demo-1
      if (!cancelled) {
        if (projectId === "demo-1") {
          setProject(MOCK_PROJECT);
        } else {
          setError("Project not found");
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // Save phase data to Supabase
  const savePhase = async (phase: string, data: any) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, data }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      const result = await res.json();

      // Refresh project data
      try {
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (projRes.ok) {
          setProject(await projRes.json());
        }
      } catch {}

      return result;
    } catch (err: any) {
      console.error("Save error:", err);
      // Don't block on save failure — just log it
      return { success: false, error: err.message };
    }
  };

  return { project, loading, error, savePhase, setProject };
}
