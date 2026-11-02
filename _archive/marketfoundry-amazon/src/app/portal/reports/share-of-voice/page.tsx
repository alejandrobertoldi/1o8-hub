"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { ShareOfVoiceSection } from "@/components/reports/v2/share-of-voice-section";

// Portal twin of /reports/share-of-voice, one block per visible client.
export default function PortalShareOfVoicePage() {
  return (
    <PortalStackedReport
      sectionId="share-of-voice"
      sectionLabel="Share of Voice"
      title="Share of voice"
      description="Brand visibility in search results — top brands, keyword coverage, and brand-vs-competitor trends per keyword."
    >
      {({ accountId, start, end }) => (
        <ShareOfVoiceSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
      )}
    </PortalStackedReport>
  );
}
