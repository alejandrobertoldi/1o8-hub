/* eslint-disable react-doctor/nextjs-no-client-side-redirect */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CompliancePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  useEffect(() => {
    // S6 is now SEO Content (compliance integrated) — redirect automatically
    router.replace(`/projects/${projectId}/seo`);
  }, [projectId, router]);

  return (
    <div className="flex items-center justify-center py-20 flex-col gap-4">
      <div className="text-zinc-500 text-sm">Redirecting to S6 SEO Content…</div>
      <p className="text-xs text-zinc-600 max-w-sm text-center">
        Compliance checking is now integrated into S6 SEO Content — it runs automatically after each batch is approved.
      </p>
    </div>
  );
}
