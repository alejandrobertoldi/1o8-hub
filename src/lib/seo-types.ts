export type SeoVersion = {
  seoVersionNumber: string;
  seoCategory: string;
  seoStatus: string;
  seoDocUrl: string | null;
  fields: Record<string, string>; // bqName → value for the 27 SEO fields
  populatedCount: number;
};
