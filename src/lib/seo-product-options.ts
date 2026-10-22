export type SeoProjectOption = {
  id: string;
  name: string;
  version: number;
  status: string;
  linkedToProduct: boolean;
};

export type SeoVersionSource = "clr" | "manager" | "bq";

export type SeoVersionOption = {
  value: string;
  seoVersionNumber: string;
  seoCategory: string;
  seoStatus: string;
  source: SeoVersionSource;
  label: string;
  projectName: string | null;
};

export type BqSeoVersionRef = {
  seoVersionNumber: string;
  seoCategory: string;
  seoStatus: string;
};

export type SeoSelectionPair = {
  projectName: string | null;
  versionValue: string;
  seoVersionNumber: string;
  seoCategory: string;
  source: SeoVersionSource;
};

const CLR_CATEGORY = "Inherited";
export const INHERITED_PROJECT_NAME = "Inherited version";

export function normalizeSeoVersionNumber(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function versionOptionValue(number: string, category: string): string {
  return `${number}::${category || "Unknown"}`;
}

export function parseVersionOptionValue(value: string): {
  seoVersionNumber: string;
  seoCategory: string;
} {
  const idx = value.indexOf("::");
  if (idx === -1) {
    return { seoVersionNumber: value, seoCategory: "" };
  }
  return {
    seoVersionNumber: value.slice(0, idx),
    seoCategory: value.slice(idx + 2),
  };
}

function isClrVersion(number: string, category: string): boolean {
  return number === "0" || category.toLowerCase() === "inherited";
}

function versionSort(a: SeoVersionOption, b: SeoVersionOption): number {
  const na = Number(a.seoVersionNumber);
  const nb = Number(b.seoVersionNumber);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (a.seoVersionNumber !== b.seoVersionNumber) {
    return a.seoVersionNumber.localeCompare(b.seoVersionNumber);
  }
  return a.seoCategory.localeCompare(b.seoCategory);
}

function versionLabel(opt: {
  seoVersionNumber: string;
  seoCategory: string;
  source: SeoVersionSource;
  projectName: string | null;
}): string {
  if (opt.source === "clr" || isClrVersion(opt.seoVersionNumber, opt.seoCategory)) {
    return `${opt.seoVersionNumber} · Inherited (CLR)`;
  }
  if (opt.projectName) return `${opt.seoVersionNumber} · ${opt.projectName}`;
  if (opt.seoCategory && opt.seoCategory !== "Unknown") {
    return `${opt.seoVersionNumber} · ${opt.seoCategory}`;
  }
  return opt.seoVersionNumber;
}

function pickProjectForVersion(
  projects: Array<{ name: string; version: number; linkedToProduct?: boolean }>,
  versionNumber: string
) {
  const matches = projects.filter((p) => String(p.version) === versionNumber);
  return matches.find((p) => p.linkedToProduct) ?? matches[0] ?? null;
}

function clrOption(): SeoVersionOption {
  return {
    value: versionOptionValue("0", CLR_CATEGORY),
    seoVersionNumber: "0",
    seoCategory: CLR_CATEGORY,
    seoStatus: "Onboarding",
    source: "clr",
    projectName: null,
    label: "0 · Inherited (CLR)",
  };
}

/**
 * Build the SEO Version Number dropdown.
 * One option per version number. Version 0 is always CLR. Other numbers
 * merge SEO Manager projects with BigQuery rows so project name and version stay paired.
 */
export function buildSeoVersionOptions(args: {
  bqVersions: BqSeoVersionRef[];
  projects: Array<{ name: string; version: number; linkedToProduct?: boolean }>;
}): SeoVersionOption[] {
  const byNumber = new Map<string, SeoVersionOption>();
  byNumber.set("0", clrOption());

  const rankedProjects = [...args.projects].sort((a, b) => {
    if (Boolean(a.linkedToProduct) !== Boolean(b.linkedToProduct)) {
      return a.linkedToProduct ? -1 : 1;
    }
    return 0;
  });

  for (const project of rankedProjects) {
    const num = String(project.version);
    if (num === "0" || byNumber.has(num)) continue;
    const name = project.name.trim() || "SEO Manager";
    const opt: SeoVersionOption = {
      value: versionOptionValue(num, name),
      seoVersionNumber: num,
      seoCategory: name,
      seoStatus: "",
      source: "manager",
      projectName: name,
      label: "",
    };
    opt.label = versionLabel(opt);
    byNumber.set(num, opt);
  }

  for (const v of args.bqVersions) {
    const num = String(v.seoVersionNumber ?? "").trim();
    if (!num) continue;
    const category = (v.seoCategory || "Unknown").trim() || "Unknown";
    if (isClrVersion(num, category)) continue;

    const existing = byNumber.get(num);
    if (existing) {
      existing.seoStatus = v.seoStatus || existing.seoStatus;
      existing.source = "bq";
      existing.seoCategory = category;
      existing.value = versionOptionValue(num, category);
      existing.label = versionLabel(existing);
      continue;
    }

    const matched = pickProjectForVersion(rankedProjects, num);
    const projectName = matched?.name.trim() || null;
    const opt: SeoVersionOption = {
      value: versionOptionValue(num, category),
      seoVersionNumber: num,
      seoCategory: category,
      seoStatus: v.seoStatus || "",
      source: "bq",
      projectName,
      label: "",
    };
    opt.label = versionLabel(opt);
    byNumber.set(num, opt);
  }

  return [...byNumber.values()].sort(versionSort);
}

export function ensureCurrentVersionOption(
  options: SeoVersionOption[],
  currentNumber: string,
  currentCategory?: string | null,
  currentProjectName?: string | null
): SeoVersionOption[] {
  const num = currentNumber.trim();
  if (!num) return options;
  if (options.some((o) => o.seoVersionNumber === num)) return options;
  const category = (currentCategory || "Current").trim() || "Current";
  const projectName = currentProjectName?.trim() || null;
  const opt: SeoVersionOption = {
    value: versionOptionValue(num, category),
    seoVersionNumber: num,
    seoCategory: category,
    seoStatus: "",
    source: "bq",
    projectName,
    label: "",
  };
  opt.label = versionLabel(opt);
  return [...options, opt].sort(versionSort);
}

export function displaySeoProjectName(args: {
  currentProjectName: string;
  versionNumber: string;
  versionSource?: SeoVersionSource | null;
  linkedFromVersion?: string | null;
}): string {
  if (
    normalizeSeoVersionNumber(args.versionNumber) === "0" ||
    args.versionSource === "clr"
  ) {
    return INHERITED_PROJECT_NAME;
  }
  return args.currentProjectName.trim() || args.linkedFromVersion?.trim() || "";
}

export function matchVersionSelectValue(
  options: SeoVersionOption[],
  currentNumber: string,
  currentCategory?: string | null,
  currentProjectName?: string | null
): string {
  const num = currentNumber.trim();
  if (!num) {
    const clr = options.find((o) => o.source === "clr");
    return clr?.value ?? "";
  }
  const projectName = currentProjectName?.trim();
  if (projectName) {
    const byProject = options.find(
      (o) => o.seoVersionNumber === num && o.projectName === projectName
    );
    if (byProject) return byProject.value;
  }
  const category = currentCategory?.trim();
  if (category) {
    const exact = options.find(
      (o) => o.seoVersionNumber === num && o.seoCategory === category
    );
    if (exact) return exact.value;
  }
  const byNumber = options.find((o) => o.seoVersionNumber === num);
  return byNumber?.value ?? "";
}

export function buildSeoProjectNameOptions(
  projects: SeoProjectOption[],
  currentName: string
): Array<{ value: string; label: string }> {
  const seen = new Set<string>([INHERITED_PROJECT_NAME]);
  const options: Array<{ value: string; label: string }> = [
    { value: INHERITED_PROJECT_NAME, label: INHERITED_PROJECT_NAME },
  ];

  const sorted = [...projects].sort((a, b) => {
    if (a.linkedToProduct !== b.linkedToProduct) {
      return a.linkedToProduct ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const project of sorted) {
    const name = project.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({ value: name, label: name });
  }

  const current = currentName.trim();
  if (current && !seen.has(current)) {
    options.unshift({ value: current, label: current });
  }

  return options;
}

function pairFromOption(option: SeoVersionOption): SeoSelectionPair {
  return {
    projectName: option.source === "clr" ? null : option.projectName,
    versionValue: option.value,
    seoVersionNumber: option.seoVersionNumber,
    seoCategory: option.seoCategory,
    source: option.source,
  };
}

/** Project name → matching version (and the reverse pairing used by the dropdowns). */
export function resolveSeoPairFromProject(
  projects: SeoProjectOption[],
  versionOptions: SeoVersionOption[],
  projectName: string
): SeoSelectionPair | null {
  const name = projectName.trim();
  if (!name) return null;

  if (name === INHERITED_PROJECT_NAME) {
    const clr = versionOptions.find((o) => o.source === "clr" || o.seoVersionNumber === "0");
    if (clr) return pairFromOption(clr);
    return {
      projectName: null,
      versionValue: versionOptionValue("0", CLR_CATEGORY),
      seoVersionNumber: "0",
      seoCategory: CLR_CATEGORY,
      source: "clr",
    };
  }

  const matches = projects.filter((p) => p.name.trim() === name);
  const project = matches.find((p) => p.linkedToProduct) ?? matches[0];
  if (!project) {
    const byName = versionOptions.find((o) => o.projectName === name);
    return byName ? pairFromOption(byName) : null;
  }

  const num = String(project.version);
  const option =
    versionOptions.find((o) => o.seoVersionNumber === num && o.projectName === name) ??
    versionOptions.find((o) => o.seoVersionNumber === num);
  if (option) {
    return {
      ...pairFromOption(option),
      projectName: name,
    };
  }

  return {
    projectName: name,
    versionValue: versionOptionValue(num, name),
    seoVersionNumber: num,
    seoCategory: name,
    source: "manager",
  };
}

/** Version option → matching project name. Version 0 (CLR) has no project. */
export function resolveSeoPairFromVersion(
  projects: SeoProjectOption[],
  option: SeoVersionOption
): SeoSelectionPair {
  if (option.source === "clr" || option.seoVersionNumber === "0") {
    return {
      projectName: null,
      versionValue: option.value,
      seoVersionNumber: option.seoVersionNumber,
      seoCategory: option.seoCategory,
      source: "clr",
    };
  }

  if (option.projectName) {
    return pairFromOption(option);
  }

  const project = pickProjectForVersion(projects, option.seoVersionNumber);
  return {
    ...pairFromOption(option),
    projectName: project?.name.trim() || null,
  };
}
