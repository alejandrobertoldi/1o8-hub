/* eslint-disable react-doctor/nextjs-no-client-side-redirect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CompliancePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  useEffect(() => {
    router.replace(`/seo/${projectId}#s6`);
  }, [projectId, router]);

  return (
    <div className="flex items-center justify-center py-20 flex-col gap-4">
      <div className="text-muted-foreground text-sm">Redirecting to S6 SEO Content…</div>
      <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
        Compliance checking is now integrated into S6 SEO Content.
      </p>
    </div>
  );
}
