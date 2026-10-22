/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ──────────────────────────────────────────────────────────

interface AsanaTaskTemplate {
  name: string;
  notes: string;
}

interface AsanaSectionTemplate {
  name: string;
  tasks: AsanaTaskTemplate[];
}

interface AsanaConfig {
  teamGid: string;
  projectNameFormat: string;
  defaultView: string;
  sections: AsanaSectionTemplate[];
}

interface AsanaConfigResponse {
  config: AsanaConfig | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ── Default template (matches create-asana-project.ts) ─────────────

const DEFAULT_CONFIG: AsanaConfig = {
  // Team "Market Foundry" in the marketfoundry.agency workspace — must stay in
  // sync with DEFAULT_TEAM_GID in create-asana-project.ts.
  teamGid: "1216009494057854",
  projectNameFormat: "{CIC} - {ClientName}",
  defaultView: "list",
  sections: [
    {
      name: "Onboarding",
      tasks: [
        { name: "Create Client", notes: "Create client record in 1o8 Hub with ID code, name, and status" },
        { name: "Assign Team", notes: "Assign team roles — auto-assigns remaining onboarding tasks to Account Manager (1o8)" },
        { name: "Setup Asana Project", notes: "Create Asana project under 1o8" },
        { name: "Client Users | Add Contact Emails", notes: "Enter client contact email(s) for portal access and communication" },
        { name: "Client Users | Add Users to 1o8 Hub", notes: "Add client Gmail account(s) to 1o8 Hub Users" },
        { name: "Client Users | Assign Client Role", notes: "Set user role to 'client' in Admin → Users" },
        { name: "Client Users | Assign Client Project", notes: "Link user to their client account (assign clientIdCode)" },
        { name: "Create Drive Folders", notes: "Create full folder tree in Google Drive for assets, SEO, PPC, docs" },
        { name: "Setup Starting Day", notes: "Set onboarding start date — Gantt timeline tasks calculated from this" },
        { name: "Send Onboarding Email", notes: "Send welcome email with portal info, strategy overview, requirements" },
        { name: "Amazon Access | Request Amazon Access", notes: "Request access to Amazon Seller Central from client" },
        { name: "Amazon Access | Provide Team Access", notes: "Provide team members access to Amazon Seller Central" },
        { name: "Intentwise | Add Sponsored Ads", notes: "Add Sponsored Ads account in Intentwise" },
        { name: "Intentwise | Add Seller Central", notes: "Add Seller Central account in Intentwise" },
        { name: "Intentwise | Get ID", notes: "Get Intentwise advertiser ID" },
        { name: "Intentwise | Request Enable", notes: "Request Enable status in Intentwise" },
        { name: "Intentwise (AMC) | Add Account", notes: "Add AMC account in Intentwise" },
        { name: "Intentwise (AMC) | Get ID", notes: "Get Intentwise AMC ID" },
        { name: "Intentwise (AMC) | Request Enable", notes: "Request Enable status for AMC" },
        { name: "FeedbackWhiz | Setup FeedbackWhiz", notes: "Set up FeedbackWhiz review monitoring" },
      ],
    },
    {
      name: "SEO",
      tasks: [
        { name: "Keyword Research", notes: "Full keyword research for all client ASINs" },
        { name: "SEO Optimization", notes: "Apply keyword strategy to titles, bullets, descriptions, and backend terms" },
        { name: "Competitors | Tracking competitors", notes: "Track and analyze competitor listings and keywords" },
      ],
    },
    {
      name: "PPC",
      tasks: [
        { name: "Intentwise | Setup Campaigns", notes: "Connect Intentwise analytics and set up PPC campaigns" },
        { name: "Campaigns | Launch", notes: "Launch PPC campaigns" },
        { name: "Campaigns | Manage", notes: "Ongoing PPC campaign management and optimization" },
      ],
    },
    {
      name: "Design",
      tasks: [
        { name: "Brandstory | Create", notes: "Design and build A+ Brand Story module" },
        { name: "A+ Content | Create", notes: "Design A+ content modules (up to 7 per ASIN)" },
        { name: "Listing Images | Create", notes: "Design, edit, and optimize listing images" },
        { name: "Storefront | Create", notes: "Design and build Amazon Storefront pages" },
      ],
    },
    {
      name: "Recurring Tasks",
      tasks: [],
    },
    {
      name: "Others",
      tasks: [],
    },
  ],
};

// ── Section Card ──────────────────────────────────────────────────

function SectionCard({
  section,
  sectionIndex,
  onChange,
  onRemove,
}: {
  section: AsanaSectionTemplate;
  sectionIndex: number;
  onChange: (updated: AsanaSectionTemplate) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);

  function updateTask(taskIndex: number, field: "name" | "notes", value: string) {
    const tasks = [...section.tasks];
    tasks[taskIndex] = { ...tasks[taskIndex], [field]: value };
    onChange({ ...section, tasks });
  }

  function addTask() {
    onChange({ ...section, tasks: [...section.tasks, { name: "", notes: "" }] });
  }

  function removeTask(taskIndex: number) {
    onChange({ ...section, tasks: section.tasks.filter((_, i) => i !== taskIndex) });
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Section header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <GripVertical className="size-4 text-muted-foreground/50" />
        <input
          type="text"
          value={section.name}
          onChange={(e) => onChange({ ...section, name: e.target.value })}
          placeholder="Section name…"
          className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">{section.tasks.length} tasks</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Tasks */}
      {open && (
        <div className="p-4 space-y-2">
          {section.tasks.map((task, ti) => (
            <div key={ti} className="flex items-start gap-2 group">
              <span className="text-[10px] text-muted-foreground tabular-nums mt-2 w-5 text-right shrink-0">
                {ti + 1}.
              </span>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={task.name}
                  onChange={(e) => updateTask(ti, "name", e.target.value)}
                  placeholder="Task name…"
                  className="flex-1 h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-brand"
                />
                <input
                  type="text"
                  value={task.notes}
                  onChange={(e) => updateTask(ti, "notes", e.target.value)}
                  placeholder="Notes…"
                  className="flex-1 h-8 rounded-md border bg-background px-2.5 text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <button
                onClick={() => removeTask(ti)}
                className="mt-1.5 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          <button
            onClick={addTask}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1"
          >
            <Plus className="size-3" />
            Add task
          </button>
        </div>
      )}
    </div>
  );
}

// ── Preview ────────────────────────────────────────────────────────

function TemplatePreview({ config }: { config: AsanaConfig }) {
  const cic = "ABC";
  const totalTasks = config.sections.reduce((sum, s) => sum + s.tasks.length, 0);

  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Preview (CIC = {cic})
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Project: <span className="font-medium text-foreground">{config.projectNameFormat.replace("{CIC}", cic).replace("{ClientName}", "Example Brand")}</span>
        {" "}&middot; {config.sections.length} sections &middot; {totalTasks} tasks
      </p>
      <div className="space-y-2">
        {config.sections.map((s, si) => (
          <div key={si}>
            <p className="text-[10px] font-bold text-foreground">{cic} | {s.name}</p>
            {s.tasks.slice(0, 3).map((t, ti) => (
              <p key={ti} className="text-[10px] text-muted-foreground ml-3">
                {cic} | {s.name} | {t.name}
              </p>
            ))}
            {s.tasks.length > 3 && (
              <p className="text-[10px] text-muted-foreground/50 ml-3">
                +{s.tasks.length - 3} more…
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function AdminAsanaPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AsanaConfigResponse>({
    queryKey: ["admin-asana-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/asana-config");
      if (!res.ok) throw new Error("Failed to load Asana config");
      return res.json();
    },
  });

  const [localConfig, setLocalConfig] = useState<AsanaConfig | null>(null);

  // Use local edits if present, else server data, else defaults
  const config = localConfig ?? data?.config ?? DEFAULT_CONFIG;
  const hasChanges = localConfig !== null;

  const saveMutation = useMutation({
    mutationFn: async (cfg: AsanaConfig) => {
      const res = await fetch("/api/admin/asana-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cfg }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Asana configuration saved");
      setLocalConfig(null);
      queryClient.invalidateQueries({ queryKey: ["admin-asana-config"] });
    },
    onError: () => toast.error("Failed to save Asana configuration"),
  });

  function updateConfig(partial: Partial<AsanaConfig>) {
    setLocalConfig({ ...config, ...partial });
  }

  function updateSection(index: number, updated: AsanaSectionTemplate) {
    const sections = [...config.sections];
    sections[index] = updated;
    updateConfig({ sections });
  }

  function removeSection(index: number) {
    updateConfig({ sections: config.sections.filter((_, i) => i !== index) });
  }

  function addSection() {
    updateConfig({
      sections: [...config.sections, { name: "", tasks: [{ name: "", notes: "" }] }],
    });
  }

  function resetToDefaults() {
    setLocalConfig({ ...DEFAULT_CONFIG });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-destructive">
        Failed to load Asana configuration. Make sure you have admin access.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Asana Sync"
        >
          <span className="font-bold text-sidebar-foreground">Asana</span>
          <span className="font-normal text-brand">Sync</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          {data?.updatedAt && (
            <p className="text-xs text-muted-foreground/60">
              Last updated {new Date(data.updatedAt).toLocaleDateString("en-US")} by {data.updatedBy}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults} className="gap-1.5">
            <RotateCcw className="size-3.5" />
            Reset Defaults
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(config)}
            disabled={!hasChanges || saveMutation.isPending}
            className="gap-1.5"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Team GID
          </label>
          <input
            type="text"
            value={config.teamGid}
            onChange={(e) => updateConfig({ teamGid: e.target.value })}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Project Name Format
          </label>
          <input
            type="text"
            value={config.projectNameFormat}
            onChange={(e) => updateConfig({ projectNameFormat: e.target.value })}
            placeholder="{CIC} - {ClientName}"
            className="w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
          />
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            Variables: {"{CIC}"}, {"{ClientName}"}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Default View
          </label>
          <select
            value={config.defaultView}
            onChange={(e) => updateConfig({ defaultView: e.target.value })}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="list">List</option>
            <option value="board">Board</option>
            <option value="timeline">Timeline</option>
            <option value="calendar">Calendar</option>
          </select>
        </div>
      </div>

      {/* Naming preview */}
      <TemplatePreview config={config} />

      {/* Sections */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Sections & Tasks</h2>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {config.sections.length} sections &middot;{" "}
            {config.sections.reduce((sum, s) => sum + s.tasks.length, 0)} tasks
          </span>
        </div>

        {config.sections.map((section, si) => (
          <SectionCard
            key={si}
            section={section}
            sectionIndex={si}
            onChange={(updated) => updateSection(si, updated)}
            onRemove={() => removeSection(si)}
          />
        ))}

        <button
          onClick={addSection}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add section
        </button>
      </div>
    </div>
  );
}
