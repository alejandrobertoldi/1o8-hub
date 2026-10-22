import { z } from "zod";

export const summaryLogoSchema = z.object({
  primary_description: z.string().nullable(),
  secondary_description: z.string().nullable(),
  monochrome_description: z.string().nullable(),
  clearspace_notes: z.string().nullable(),
  misuse_notes: z.string().nullable(),
  primary_url: z.string().nullable(),
  secondary_url: z.string().nullable(),
  monochrome_url: z.string().nullable(),
});
export type SummaryLogo = z.infer<typeof summaryLogoSchema>;

export const summaryColorRoleSchema = z.enum(["primary", "secondary", "accent", "neutral"]);
export const summaryColorSchema = z.object({
  role: summaryColorRoleSchema,
  tier: z.string().nullable().optional(),
  name: z.string(),
  hex: z.string(),
  rgb: z.string().nullable(),
  cmyk: z.string().nullable(),
});
export const summaryColorsSchema = z.array(summaryColorSchema);
export type SummaryColor = z.infer<typeof summaryColorSchema>;

export const summaryFontSchema = z.object({
  family: z.string(),
  weights: z.array(z.string()),
  fallback: z.string().nullable(),
}).nullable();
export const summaryTypographySchema = z.object({
  primary: summaryFontSchema,
  secondary: summaryFontSchema,
});
export type SummaryTypography = z.infer<typeof summaryTypographySchema>;

export const summaryVoiceSchema = z.object({
  attributes: z.array(z.string()),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
  sample_copy: z.string().nullable(),
});
export type SummaryVoice = z.infer<typeof summaryVoiceSchema>;

export const summaryAllSchema = z.object({
  logo: summaryLogoSchema,
  colors: summaryColorsSchema,
  typography: summaryTypographySchema,
  voice: summaryVoiceSchema,
});
export type SummaryAll = z.infer<typeof summaryAllSchema>;

export const summaryPatchSchema = z.object({
  logo: summaryLogoSchema.partial().optional(),
  colors: summaryColorsSchema.optional(),
  typography: summaryTypographySchema.partial().optional(),
  voice: summaryVoiceSchema.partial().optional(),
});
export type SummaryPatch = z.infer<typeof summaryPatchSchema>;
