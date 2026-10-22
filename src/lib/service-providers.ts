import { z } from "zod";
import { READINESS_DEPARTMENTS } from "@/lib/readiness/match";

/**
 * Contracted service providers (agencies / freelancers such as WODO) — not
 * employees. Shared shape + validation for the admin API and form.
 */
export const PROVIDER_KINDS = ["agency", "freelancer"] as const;
export const PROVIDER_STATUSES = ["active", "inactive"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const providerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  kind: z.enum(PROVIDER_KINDS).default("agency"),
  contactName: optionalText(255),
  department: z.enum(READINESS_DEPARTMENTS).nullish().transform((v) => v ?? null),
  services: optionalText(2000),
  emails: z
    .array(z.string().trim().toLowerCase().email("Invalid email"))
    .max(20)
    .default([])
    .transform((list) => [...new Set(list)]),
  website: optionalText(500),
  location: optionalText(160),
  timeZone: optionalText(60),
  status: z.enum(PROVIDER_STATUSES).default("active"),
  notes: optionalText(5000),
});
export type ProviderInput = z.input<typeof providerSchema>;

export type ProviderWithWork = {
  id: string;
  name: string;
  kind: string;
  contactName: string | null;
  department: string | null;
  services: string | null;
  emails: string[];
  website: string | null;
  location: string | null;
  timeZone: string | null;
  status: string;
  notes: string | null;
  // Linked Asana assignees and their open tasks (Readiness).
  assignees: { assigneeKey: string; assigneeName: string | null; open: number }[];
  open: number;
};
