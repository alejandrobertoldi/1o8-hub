import type { NewGanttTemplate } from "@/lib/db/schema";

type TemplateSeed = Omit<NewGanttTemplate, "id">;

// ── AIA ───────────────────────────────────────────────────────────────
// Default project template matching Asana sections layout.
// Sections: Onboarding, SEO, PPC, Design, Recurring Tasks, Others

export const AIA_TASKS: TemplateSeed[] = [
  // Onboarding — standalone tasks (no subtask)
  { templateType: "AIA", section: "Onboarding", wbs: "1.01", taskName: "Create Client", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create the client record in 1o8 Hub" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.02", taskName: "Assign Team", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Assign team roles — auto-assigns remaining tasks to Account Manager (1o8)" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.03", taskName: "Setup Asana Project", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create Asana project for client" },
  // Onboarding — Client Users (4 subtasks)
  { templateType: "AIA", section: "Onboarding", wbs: "1.04", taskName: "Client Users", subtaskTitle: "Add Contact Emails", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add client contact email(s) to AAC" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.05", taskName: "Client Users", subtaskTitle: "Add Users to 1o8 Hub", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add client Gmail accounts to 1o8 Hub Users" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.06", taskName: "Client Users", subtaskTitle: "Assign Client Role", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Set user role to client in Admin" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.07", taskName: "Client Users", subtaskTitle: "Assign Client Project", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Link user to their client account" },
  // Onboarding — more standalone tasks
  { templateType: "AIA", section: "Onboarding", wbs: "1.08", taskName: "Create Drive Folders", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create shared Drive folder structure" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.09", taskName: "Setup Starting Day", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Set onboarding start date" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.10", taskName: "Send Onboarding Email", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Send welcome email to client" },
  // Onboarding — Amazon Access (2 subtasks)
  { templateType: "AIA", section: "Onboarding", wbs: "1.11", taskName: "Amazon Access", subtaskTitle: "Request Amazon Access", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request access to Amazon from client" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.12", taskName: "Amazon Access", subtaskTitle: "Provide Team Access", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 2, description: "Distribute Amazon access to team" },
  // Onboarding — Intentwise (4 subtasks)
  { templateType: "AIA", section: "Onboarding", wbs: "1.13", taskName: "Intentwise", subtaskTitle: "Add Sponsored Ads", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add Sponsored Ads account in Intentwise" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.14", taskName: "Intentwise", subtaskTitle: "Add Seller Central", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add Seller Central account in Intentwise" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.15", taskName: "Intentwise", subtaskTitle: "Get ID", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Get Intentwise advertiser ID" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.16", taskName: "Intentwise", subtaskTitle: "Request Enable", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request Enable status in Intentwise" },
  // Onboarding — Intentwise AMC (3 subtasks)
  { templateType: "AIA", section: "Onboarding", wbs: "1.17", taskName: "Intentwise (AMC)", subtaskTitle: "Add Account", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add AMC account in Intentwise" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.18", taskName: "Intentwise (AMC)", subtaskTitle: "Get ID", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Get Intentwise AMC ID" },
  { templateType: "AIA", section: "Onboarding", wbs: "1.19", taskName: "Intentwise (AMC)", subtaskTitle: "Request Enable", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request Enable status for AMC" },
  // Onboarding — FeedbackWhiz (1 subtask)
  { templateType: "AIA", section: "Onboarding", wbs: "1.20", taskName: "FeedbackWhiz", subtaskTitle: "Setup FeedbackWhiz", weekStart: 4, weekEnd: 5, startDay: 22, durationDays: 14, description: "Set up FeedbackWhiz review monitoring" },
  // SEO (3 tasks — 2 standalone + 1 with subtask)
  { templateType: "AIA", section: "SEO", wbs: "2.01", taskName: "Keyword Research", subtaskTitle: null, weekStart: 2, weekEnd: 10, startDay: 8, durationDays: 63, description: "Full keyword research for all client ASINs" },
  { templateType: "AIA", section: "SEO", wbs: "2.02", taskName: "SEO Optimization", subtaskTitle: null, weekStart: 3, weekEnd: 12, startDay: 15, durationDays: 70, description: "Apply keyword strategy to titles, bullets, descriptions, and backend terms" },
  { templateType: "AIA", section: "SEO", wbs: "2.03", taskName: "Competitors", subtaskTitle: "Tracking competitors", weekStart: 2, weekEnd: 12, startDay: 8, durationDays: 77, description: "Track and analyze competitor listings and keywords" },
  // PPC (3 tasks with subtasks)
  { templateType: "AIA", section: "PPC", wbs: "3.01", taskName: "Intentwise", subtaskTitle: "Setup Campaigns", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Connect Intentwise analytics and set up PPC campaigns" },
  { templateType: "AIA", section: "PPC", wbs: "3.02", taskName: "Campaigns", subtaskTitle: "Launch", weekStart: 3, weekEnd: 3, startDay: 15, durationDays: 7, description: "Launch PPC campaigns" },
  { templateType: "AIA", section: "PPC", wbs: "3.03", taskName: "Campaigns", subtaskTitle: "Manage", weekStart: 4, weekEnd: 13, startDay: 22, durationDays: 70, description: "Ongoing PPC campaign management and optimization" },
  // Design (4 tasks with subtasks)
  { templateType: "AIA", section: "Design", wbs: "4.01", taskName: "Brandstory", subtaskTitle: "Create", weekStart: 3, weekEnd: 8, startDay: 15, durationDays: 42, description: "Design and build A+ Brand Story module" },
  { templateType: "AIA", section: "Design", wbs: "4.02", taskName: "A+ Content", subtaskTitle: "Create", weekStart: 3, weekEnd: 10, startDay: 15, durationDays: 56, description: "Design A+ content modules (up to 7 per ASIN)" },
  { templateType: "AIA", section: "Design", wbs: "4.03", taskName: "Listing Images", subtaskTitle: "Create", weekStart: 2, weekEnd: 10, startDay: 8, durationDays: 63, description: "Design, edit, and optimize listing images" },
  { templateType: "AIA", section: "Design", wbs: "4.04", taskName: "Storefront", subtaskTitle: "Create", weekStart: 9, weekEnd: 13, startDay: 57, durationDays: 35, description: "Design and build Amazon Storefront pages" },
];

// ── NTA ───────────────────────────────────────────────────────────────

export const NTA_TASKS: TemplateSeed[] = [
  // Onboarding — standalone tasks
  { templateType: "NTA", section: "Onboarding", wbs: "1.01", taskName: "Create Client", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create the client record in 1o8 Hub" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.02", taskName: "Assign Team", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Assign team roles — auto-assigns remaining tasks to Account Manager (1o8)" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.03", taskName: "Setup Asana Project", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create Asana project for client" },
  // Onboarding — Client Users (4 subtasks)
  { templateType: "NTA", section: "Onboarding", wbs: "1.04", taskName: "Client Users", subtaskTitle: "Add Contact Emails", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add client contact email(s) to AAC" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.05", taskName: "Client Users", subtaskTitle: "Add Users to 1o8 Hub", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add client Gmail accounts to 1o8 Hub Users" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.06", taskName: "Client Users", subtaskTitle: "Assign Client Role", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Set user role to client in Admin" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.07", taskName: "Client Users", subtaskTitle: "Assign Client Project", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Link user to their client account" },
  // Onboarding — more standalone tasks
  { templateType: "NTA", section: "Onboarding", wbs: "1.08", taskName: "Create Drive Folders", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Create shared Drive folder structure" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.09", taskName: "Setup Starting Day", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Set onboarding start date" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.10", taskName: "Send Onboarding Email", subtaskTitle: null, weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Send welcome email to client" },
  // Onboarding — Amazon Access (2 subtasks)
  { templateType: "NTA", section: "Onboarding", wbs: "1.11", taskName: "Amazon Access", subtaskTitle: "Request Amazon Access", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request access to Amazon from client" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.12", taskName: "Amazon Access", subtaskTitle: "Provide Team Access", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 2, description: "Distribute Amazon access to team" },
  // Onboarding — Intentwise (4 subtasks)
  { templateType: "NTA", section: "Onboarding", wbs: "1.13", taskName: "Intentwise", subtaskTitle: "Add Sponsored Ads", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add Sponsored Ads account in Intentwise" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.14", taskName: "Intentwise", subtaskTitle: "Add Seller Central", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add Seller Central account in Intentwise" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.15", taskName: "Intentwise", subtaskTitle: "Get ID", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Get Intentwise advertiser ID" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.16", taskName: "Intentwise", subtaskTitle: "Request Enable", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request Enable status in Intentwise" },
  // Onboarding — Intentwise AMC (3 subtasks)
  { templateType: "NTA", section: "Onboarding", wbs: "1.17", taskName: "Intentwise (AMC)", subtaskTitle: "Add Account", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Add AMC account in Intentwise" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.18", taskName: "Intentwise (AMC)", subtaskTitle: "Get ID", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Get Intentwise AMC ID" },
  { templateType: "NTA", section: "Onboarding", wbs: "1.19", taskName: "Intentwise (AMC)", subtaskTitle: "Request Enable", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Request Enable status for AMC" },
  // Onboarding — FeedbackWhiz (1 subtask)
  { templateType: "NTA", section: "Onboarding", wbs: "1.20", taskName: "FeedbackWhiz", subtaskTitle: "Setup FeedbackWhiz", weekStart: 4, weekEnd: 5, startDay: 22, durationDays: 11, description: "Set up FeedbackWhiz review monitoring" },
  // SEO (3 tasks)
  { templateType: "NTA", section: "SEO", wbs: "2.01", taskName: "Keyword Research", subtaskTitle: null, weekStart: 2, weekEnd: 10, startDay: 8, durationDays: 63, description: "Full keyword research for all client ASINs" },
  { templateType: "NTA", section: "SEO", wbs: "2.02", taskName: "SEO Optimization", subtaskTitle: null, weekStart: 3, weekEnd: 12, startDay: 15, durationDays: 70, description: "Apply keyword strategy to titles, bullets, descriptions, and backend terms" },
  { templateType: "NTA", section: "SEO", wbs: "2.03", taskName: "Competitors", subtaskTitle: "Tracking competitors", weekStart: 2, weekEnd: 12, startDay: 8, durationDays: 77, description: "Track and analyze competitor listings and keywords" },
  // PPC (3 tasks with subtasks)
  { templateType: "NTA", section: "PPC", wbs: "3.01", taskName: "Intentwise", subtaskTitle: "Setup Campaigns", weekStart: 1, weekEnd: 1, startDay: 1, durationDays: 1, description: "Connect Intentwise analytics and set up PPC campaigns" },
  { templateType: "NTA", section: "PPC", wbs: "3.02", taskName: "Campaigns", subtaskTitle: "Launch", weekStart: 3, weekEnd: 3, startDay: 15, durationDays: 7, description: "Launch PPC campaigns" },
  { templateType: "NTA", section: "PPC", wbs: "3.03", taskName: "Campaigns", subtaskTitle: "Manage", weekStart: 4, weekEnd: 13, startDay: 22, durationDays: 70, description: "Ongoing PPC campaign management and optimization" },
  // Design (4 tasks with subtasks)
  { templateType: "NTA", section: "Design", wbs: "4.01", taskName: "Brandstory", subtaskTitle: "Create", weekStart: 3, weekEnd: 8, startDay: 15, durationDays: 42, description: "Design and build A+ Brand Story module" },
  { templateType: "NTA", section: "Design", wbs: "4.02", taskName: "A+ Content", subtaskTitle: "Create", weekStart: 3, weekEnd: 10, startDay: 15, durationDays: 56, description: "Design A+ content modules (up to 7 per ASIN)" },
  { templateType: "NTA", section: "Design", wbs: "4.03", taskName: "Listing Images", subtaskTitle: "Create", weekStart: 2, weekEnd: 10, startDay: 8, durationDays: 63, description: "Design, edit, and optimize listing images" },
  { templateType: "NTA", section: "Design", wbs: "4.04", taskName: "Storefront", subtaskTitle: "Create", weekStart: 9, weekEnd: 13, startDay: 57, durationDays: 35, description: "Design and build Amazon Storefront pages" },
];

export const ALL_TEMPLATES = [...AIA_TASKS, ...NTA_TASKS];

/** Section display order */
export const SECTION_ORDER = ["Onboarding", "SEO", "PPC", "Design", "Recurring Tasks", "Others"] as const;

/** Total weeks in the onboarding timeline */
export const TOTAL_WEEKS = 13;

/** Ownership team options */
export const OWNERSHIP_TEAMS = [
  "Project Manager",
  "Catalog",
  "SEO",
  "PPC",
  "Design",
  "Account Manager",
  "Executive Strategist",
] as const;
