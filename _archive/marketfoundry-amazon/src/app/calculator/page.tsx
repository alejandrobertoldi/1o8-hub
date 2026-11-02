import type { Metadata } from "next";
import { RevCalculator } from "@/components/tools/rev-calculator";

export const metadata: Metadata = {
  title: "Amazon FBA Revenue Calculator — 1o8",
  description:
    "Free Amazon FBA revenue calculator. Estimate referral fees, fulfillment costs, storage fees, and net profit for any product.",
};

export default function PublicCalculatorPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <RevCalculator variant="public" />
      </div>
    </div>
  );
}
