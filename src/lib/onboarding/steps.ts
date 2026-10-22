// ═══════════════════════════════════════════════════════════════
// Client onboarding step definitions
// Add new steps here as the onboarding process grows.
// ═══════════════════════════════════════════════════════════════

export interface OnboardingStepDef {
  key: string;
  label: string;
  description: string;
  /** Order in which steps appear in the UI */
  order: number;
  /** Optional parent key for visual grouping as substep */
  parent?: string;
  /** If set, only show when client Marketplace matches (e.g. "VC" for Vendor Central) */
  marketplaceFilter?: string;
  /** If set, only show when client.clientType matches (e.g. "AIA") */
  clientTypeFilter?: "AIA" | "NTA";
  /** Optional steps don't block their parent group from reaching 100% */
  optional?: boolean;
}

/** Keys of steps that don't block their parent group from being "completed". */
export const OPTIONAL_STEP_KEYS: ReadonlySet<string> = new Set(["generate_listing_sheet"]);

/** Aggregate completion predicate: treats optional steps as always satisfied. */
export function isStepSatisfied(step: { key: string; status: string }): boolean {
  return step.status === "completed" || OPTIONAL_STEP_KEYS.has(step.key);
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  // ── Step 1: Create Client ──
  {
    key: "create_client",
    label: "Create Client",
    description: "Create the client record in the app with ID code, name, and status.",
    order: 1,
    parent: "create_client",
  },
  // ── Step 2: Assign Team ──
  {
    key: "assign_team",
    label: "Assign Team",
    description: "Assign team roles for this client. Once assigned, remaining onboarding tasks are auto-assigned to the Account Manager (1o8), except FeedbackWhiz which goes to the Executive Strategist.",
    order: 2,
    parent: "assign_team",
  },
  // ── Step 3: Setup Asana Project ──
  {
    key: "setup_asana",
    label: "Setup Asana Project",
    description: "Create a project in Asana under 1o8 with onboarding, content, and PPC sections.",
    order: 3,
    parent: "setup_asana",
  },
  // ── Step 4: Setup Starting Day & Timeline ──
  {
    key: "setup_timeline",
    label: "Setup Starting Day & Timeline",
    description: "Set the onboarding start date and initialize the 13-week Gantt timeline from the AIA/NTA template.",
    order: 4,
    parent: "setup_timeline",
  },
  // ── Step 5: Add Client Users (4 sub-steps) ──
  {
    key: "add_contact_emails",
    label: "Add Contact Email(s)",
    description: "Enter the client's contact email address(es) for portal access and communication.",
    order: 5,
    parent: "client_users",
  },
  {
    key: "hub_add_user",
    label: "Add Client Account(s)",
    description: "Add client's Gmail account(s) to 1o8 Hub Users section (Admin → Users).",
    order: 5.1,
    parent: "client_users",
  },
  {
    key: "hub_assign_role",
    label: "Assign Client Role",
    description: "Set user role to 'client' in Admin → Users.",
    order: 5.2,
    parent: "client_users",
  },
  {
    key: "hub_assign_client",
    label: "Assign Client Project",
    description: "Link the user to their client account (assign clientIdCode).",
    order: 5.3,
    parent: "client_users",
  },
  // ── Step 6: Create Drive Folders ──
  {
    key: "drive_folders",
    label: "Create Drive Folders",
    description: "Create the full folder tree in Google Drive for client assets, graphics, SEO, PPC, and documentation.",
    order: 6,
    parent: "drive_folders",
  },
  // ── Step 7: Send Onboarding Email ──
  {
    key: "send_onboarding_email",
    label: "Send Onboarding Email",
    description: "Send the welcome email to the client with portal info, strategy overview, and onboarding requirements.",
    order: 7,
    parent: "send_onboarding_email",
  },
  // ── Step 8: Amazon Access (2 sub-steps) ──
  {
    key: "amazon_access_request",
    label: "Request Amazon Access",
    description: "Request access to Amazon Seller Central from the client.",
    order: 8,
    parent: "amazon_access",
  },
  {
    key: "amazon_access_team",
    label: "Provide Team Access",
    description: "Provide team members access to Amazon Seller Central.",
    order: 8.1,
    parent: "amazon_access",
  },
  {
    key: "amazon_import_attributes",
    label: "Import Product Attributes (CLR)",
    description: "Upload the Amazon Category Listing Report (.xlsm) to register attribute schemas, join SKUs to ASINs from a staged All Listings Report (seller-sku), and upload listings to the Hub.",
    order: 8.2,
    parent: "amazon_access",
  },
  {
    key: "amazon_import_catalog",
    label: "Link SKU↔ASIN (ALR) and merge to master",
    description: "Upload the Amazon All Listings Report to stage SKU↔ASIN links, then merge staged CLR + ALR data into master (filtered by status). AIA clients only.",
    order: 8.3,
    parent: "amazon_access",
    clientTypeFilter: "AIA",
  },
  {
    key: "generate_listing_sheet",
    label: "Generate Listings Sheet (Min. + Necessary)",
    description: "Create a Google Sheet with minimum + necessary attributes for the client to fill in. Imported back as new master listings.",
    order: 8.4,
    parent: "amazon_access",
    clientTypeFilter: "AIA",
    optional: true,
  },
  // ── Step 9: Setup Intentwise (5 sub-steps) ──
  {
    key: "iw_get_merchant_id",
    label: "Get Merchant ID",
    description: "Retrieve the Merchant ID from Amazon Seller Central (Seller Account → Account Info → Merchant Token).",
    order: 9,
    parent: "intentwise",
  },
  {
    key: "iw_request_subscriptions",
    label: "Request Subscriptions",
    description: "Contact Intentwise with the Merchant ID to request Amazon Seller Central and Amazon Sponsored Ads subscriptions.",
    order: 9.1,
    parent: "intentwise",
  },
  {
    key: "intentwise_id_provided",
    label: "Enter Intentwise ID & Name",
    description: "Enter the Intentwise ID and Intentwise Name provided by Intentwise after subscriptions are set up.",
    order: 9.2,
    parent: "intentwise",
  },
  {
    key: "iw_enabled",
    label: "Request Enable",
    description: "Request Intentwise to enable both Amazon Seller Central and Sponsored Ads subscriptions.",
    order: 9.3,
    parent: "intentwise",
  },
  {
    key: "iw_confirm_enabled",
    label: "Confirm Enabled",
    description: "Confirm that both Amazon Seller Central and Sponsored Ads subscriptions are active and enabled in Intentwise.",
    order: 9.4,
    parent: "intentwise",
  },
  // ── Step 10: Setup Intentwise AMC (4 sub-steps) ──
  {
    key: "iw_amc_request",
    label: "Request Amazon Marketing Cloud",
    description: "Contact Intentwise to request Amazon Marketing Cloud (AMC) subscription setup.",
    order: 10,
    parent: "intentwise_amc",
  },
  {
    key: "intentwise_amc_id_provided",
    label: "Enter AMC ID & Name",
    description: "Enter the Intentwise AMC ID and Intentwise AMC Name provided by Intentwise after AMC is set up.",
    order: 10.1,
    parent: "intentwise_amc",
  },
  {
    key: "iw_amc_enabled",
    label: "Request Enable",
    description: "Request Intentwise to enable the Amazon Marketing Cloud subscription.",
    order: 10.2,
    parent: "intentwise_amc",
  },
  {
    key: "iw_amc_confirm_enabled",
    label: "Confirm Enabled",
    description: "Confirm that the Amazon Marketing Cloud subscription is active and enabled in Intentwise.",
    order: 10.3,
    parent: "intentwise_amc",
  },
  // ── Step 11: Setup FeedbackWhiz ──
  {
    key: "feedbackwhiz",
    label: "Setup FeedbackWhiz",
    description: "Set up FeedbackWhiz review monitoring for the client's products.",
    order: 11,
    parent: "feedbackwhiz_group",
  },
];

export function getStepDef(key: string): OnboardingStepDef | undefined {
  return ONBOARDING_STEPS.find((s) => s.key === key);
}

/**
 * Maps onboarding step keys → Gantt taskName values (in the Onboarding section).
 * When an onboarding step completes, the matching Gantt task is auto-updated.
 * Keys not listed here have no corresponding Gantt task.
 */
export const STEP_TO_GANTT: Record<string, { taskName: string; subtaskTitle?: string }> = {
  create_client:         { taskName: "Create Client" },
  assign_team:           { taskName: "Assign Team" },
  add_contact_emails:    { taskName: "Client Users", subtaskTitle: "Add Contact Emails" },
  setup_timeline:        { taskName: "Setup Starting Day" },
  drive_folders:         { taskName: "Create Drive Folders" },
  send_onboarding_email: { taskName: "Send Onboarding Email" },
  hub_add_user:          { taskName: "Client Users", subtaskTitle: "Add Users to 1o8 Hub" },
  hub_assign_role:       { taskName: "Client Users", subtaskTitle: "Assign Client Role" },
  hub_assign_client:     { taskName: "Client Users", subtaskTitle: "Assign Client Project" },
  setup_asana:           { taskName: "Setup Asana Project" },
  amazon_access_request: { taskName: "Amazon Access", subtaskTitle: "Request Amazon Access" },
  amazon_access_team:    { taskName: "Amazon Access", subtaskTitle: "Provide Team Access" },
  amazon_import_catalog:    { taskName: "Amazon Access", subtaskTitle: "Link SKU↔ASIN and merge" },
  amazon_import_attributes: { taskName: "Amazon Access", subtaskTitle: "Import Product Attributes" },
  generate_listing_sheet:   { taskName: "Amazon Access", subtaskTitle: "Generate Listings Sheet" },
  iw_get_merchant_id:         { taskName: "Intentwise", subtaskTitle: "Get Merchant ID" },
  iw_request_subscriptions:   { taskName: "Intentwise", subtaskTitle: "Request Subscriptions" },
  intentwise_id_provided:     { taskName: "Intentwise", subtaskTitle: "Enter Intentwise ID & Name" },
  iw_enabled:                 { taskName: "Intentwise", subtaskTitle: "Request Enable" },
  iw_confirm_enabled:         { taskName: "Intentwise", subtaskTitle: "Confirm Enabled" },
  iw_amc_request:             { taskName: "Intentwise (AMC)", subtaskTitle: "Request Amazon Marketing Cloud" },
  intentwise_amc_id_provided: { taskName: "Intentwise (AMC)", subtaskTitle: "Enter AMC ID & Name" },
  iw_amc_enabled:             { taskName: "Intentwise (AMC)", subtaskTitle: "Request Enable" },
  iw_amc_confirm_enabled:     { taskName: "Intentwise (AMC)", subtaskTitle: "Confirm Enabled" },
  feedbackwhiz:          { taskName: "FeedbackWhiz", subtaskTitle: "Setup FeedbackWhiz" },
};

/** Parent groups that have sub-steps — used for auto-complete logic */
export const PARENT_GROUPS = ["client_users", "amazon_access", "intentwise", "intentwise_amc"] as const;

/** Display labels for parent groups (shown in UI as section headers) */
export const PARENT_GROUP_LABELS: Record<string, { order: number; label: string }> = {
  create_client:     { order: 1, label: "1. Create Client" },
  assign_team:       { order: 2, label: "2. Assign Team" },
  setup_asana:       { order: 3, label: "3. Setup Asana Project" },
  setup_timeline:    { order: 4, label: "4. Setup Starting Day & Timeline" },
  client_users:      { order: 5, label: "5. Add Client Users" },
  drive_folders:     { order: 6, label: "6. Create Drive Folders" },
  send_onboarding_email: { order: 7, label: "7. Send Onboarding Email" },
  amazon_access:     { order: 8, label: "8. Amazon Access" },
  intentwise:        { order: 9, label: "9. Setup Intentwise" },
  intentwise_amc:    { order: 10, label: "10. Setup Intentwise AMC" },
  feedbackwhiz_group:{ order: 11, label: "11. Setup FeedbackWhiz" },
};

/** Get all steps belonging to a parent group */
export function getStepsForParent(parentKey: string): OnboardingStepDef[] {
  return ONBOARDING_STEPS.filter((s) => s.parent === parentKey);
}

/** Check if a parent group is a multi-step group (has >1 sub-steps) */
export function isMultiStepParent(parentKey: string): boolean {
  return (PARENT_GROUPS as readonly string[]).includes(parentKey);
}
