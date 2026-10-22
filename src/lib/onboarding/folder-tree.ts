// ═══════════════════════════════════════════════════════════════
// Client onboarding — Drive folder tree definition
// Each new client gets this folder structure created in the shared Drive.
// A+ Content subfolders (BA+/PA+) are NOT created here — they are
// created on-demand by resolveAplusFolder() in drive-upload.ts.
// ═══════════════════════════════════════════════════════════════

export interface FolderNode {
  name: string;
  /** Stored in drive_folders.folder_type for lookups */
  type: string;
  children?: FolderNode[];
}

/**
 * The complete folder tree created for each new client.
 * Level 0 (root) is the client folder itself — its name is the clientIdCode.
 */
export const CLIENT_FOLDER_TREE: FolderNode[] = [
  {
    name: "Amazon Documentation",
    type: "amazon_documentation",
    children: [
      { name: "Climate Pledge Friendly Program", type: "climate_pledge" },
    ],
  },
  {
    name: "Client Resources",
    type: "client_resources",
    children: [
      { name: "Shortcuts", type: "shortcuts" },
      {
        name: "Images",
        type: "resource_images",
        children: [
          { name: "Logos", type: "client_logos" },
        ],
      },
      { name: "Videos", type: "resource_videos" },
      {
        name: "Guidelines",
        type: "guidelines",
        children: [{ name: "Fonts", type: "fonts" }],
      },
      { name: "Certificates", type: "certificates" },
    ],
  },
  {
    name: "Graphics",
    type: "graphics",
    children: [
      {
        name: "A+ Content",
        type: "aplus",
        children: [
          { name: "A+ - Content for Upload", type: "aplus_upload" },
          { name: "A+ - Master Files", type: "aplus_master" },
        ],
      },
      {
        name: "Listing Images",
        type: "listing_images",
        children: [
          { name: "LI - Content for Upload", type: "li_upload" },
          { name: "LI - Master Files", type: "li_master" },
        ],
      },
      {
        name: "Storefront",
        type: "storefront",
        children: [
          { name: "SF - Content for Upload", type: "sf_upload" },
          { name: "SF - Master Files", type: "sf_master" },
        ],
      },
      {
        name: "Brand Story",
        type: "brand_story",
        children: [
          { name: "BS - Content for Upload", type: "bs_upload" },
          { name: "BS - Master Files", type: "bs_master" },
        ],
      },
      {
        name: "Amazon Posts",
        type: "amazon_posts",
        children: [
          { name: "AP - Content for Upload", type: "ap_upload" },
          { name: "AP - Master Files", type: "ap_master" },
        ],
      },
      {
        name: "Custom Creative Images",
        type: "custom_creative",
        children: [
          { name: "Lifestyle Images", type: "lifestyle_images" },
          { name: "AI Generated Images", type: "ai_images" },
        ],
      },
    ],
  },
  {
    name: "PPC",
    type: "ppc",
    children: [
      { name: "PPC Keywords research", type: "ppc_keywords" },
      { name: "Records", type: "ppc_records" },
    ],
  },
  {
    name: "SEO",
    type: "seo",
    children: [
      { name: "SEO Keywords research", type: "seo_keywords" },
      { name: "SEO Files", type: "seo_files" },
    ],
  },
  { name: "Research", type: "research" },
  { name: "Success", type: "success" },
  { name: "ZOld Files", type: "zold_files" },
];
