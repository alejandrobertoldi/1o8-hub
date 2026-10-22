"use client";
/* eslint-disable react-doctor/prefer-useReducer */

import { hasAdminPowers } from "@/lib/roles";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check } from "lucide-react";
import { StepSource, type ImportSourceState } from "./step-source";
import { StepMapping } from "./step-mapping";
import { StepOptions } from "./step-options";
import { StepExecute } from "./step-execute";
import type { ColumnMapping } from "@/lib/import-mapper";

type ImportStep = "source" | "mapping" | "options" | "execute";

const STEPS: { key: ImportStep; label: string; number: number }[] = [
  { key: "source", label: "Source", number: 1 },
  { key: "mapping", label: "Mapping", number: 2 },
  { key: "options", label: "Options", number: 3 },
  { key: "execute", label: "Import", number: 4 },
];

export function ImportWizard() {
  const { data: session } = useSession();
  const [step, setStep] = useState<ImportStep>("source");

  // Shared state across steps
  const [sourceState, setSourceState] = useState<ImportSourceState | null>(null);
  const [confirmedMappings, setConfirmedMappings] = useState<ColumnMapping[]>([]);
  const [conflictMode, setConflictMode] = useState<"skip" | "overwrite" | "merge">("skip");
  const [clientFilter, setClientFilter] = useState("");

  if (!hasAdminPowers(session?.user?.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Unauthorized</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Only admin users can access the import wizard.
          </p>
        </div>
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {STEPS.map((s, i) => {
          const isActive = s.key === step;
          const isCompleted = i < currentIdx;
          return (
            <div key={s.key} className="flex items-center">
              {i > 0 && (
                <div
                  className="w-12 h-0.5 mx-1"
                  style={{
                    backgroundColor: isCompleted ? "var(--brand)" : "oklch(1 0 0 / 12%)",
                  }}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className="size-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive || isCompleted ? "var(--brand)" : "oklch(1 0 0 / 12%)",
                    color: isActive || isCompleted ? "var(--brand-foreground)" : "#9ca3af",
                  }}
                >
                  {isCompleted ? <Check className="size-4" /> : s.number}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-foreground"
                      : isCompleted
                        ? "text-foreground/80"
                        : "text-muted-foreground/70"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === "source" && (
        <StepSource
          sourceState={sourceState}
          onComplete={(state) => {
            setSourceState(state);
            setConfirmedMappings(state.mappings);
            setStep("mapping");
          }}
        />
      )}

      {step === "mapping" && sourceState && (
        <StepMapping
          sourceState={sourceState}
          mappings={confirmedMappings}
          onBack={() => setStep("source")}
          onComplete={(mappings) => {
            setConfirmedMappings(mappings);
            setStep("options");
          }}
        />
      )}

      {step === "options" && sourceState && (
        <StepOptions
          sourceState={sourceState}
          mappings={confirmedMappings}
          conflictMode={conflictMode}
          onConflictModeChange={setConflictMode}
          clientFilter={clientFilter}
          onClientFilterChange={setClientFilter}
          onBack={() => setStep("mapping")}
          onComplete={() => setStep("execute")}
        />
      )}

      {step === "execute" && sourceState && (
        <StepExecute
          sourceState={sourceState}
          mappings={confirmedMappings}
          conflictMode={conflictMode}
          clientFilter={clientFilter}
          onBack={() => setStep("options")}
          onReset={() => {
            setStep("source");
            setSourceState(null);
            setConfirmedMappings([]);
            setConflictMode("skip");
            setClientFilter("");
          }}
        />
      )}
    </div>
  );
}
