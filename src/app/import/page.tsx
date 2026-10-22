import { Suspense } from "react";
import { ImportWizard } from "@/components/import/import-wizard";
import { ImportPageMeta } from "./page-meta";

export const metadata = { title: "Import | 1o8 Hub" };

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <ImportPageMeta />
      <Suspense>
        <ImportWizard />
      </Suspense>
    </div>
  );
}
