# Drive Folder Tree — Reference Guide

This document describes the folder structure created for each client in Google Drive, and how to reference specific folders programmatically.

---

## Folder Structure

When a new client is created, the following folder tree is generated inside the **Google Shared Drive** (configured via `GOOGLE_SHARED_DRIVE_ID`):

```
{clientIdCode}_{clientName}/               ← Root (type: "client")
│
├── Amazon Documentation/                  ← type: "amazon_documentation"
│   └── Climate Pledge Friendly Program/  ← type: "climate_pledge"
│
├── Client Resources/                      ← type: "client_resources"
│   ├── Shortcuts/                         ← type: "shortcuts"
│   ├── Images/                            ← type: "resource_images"
│   ├── Videos/                            ← type: "resource_videos"
│   ├── Guidelines/                         ← type: "guidelines"
│   │   └── Fonts/                         ← type: "fonts"
│   └── Certificates/                      ← type: "certificates"
│
├── Graphics/                              ← type: "graphics"
│   ├── A+ Content/                        ← type: "aplus"
│   ├── Listing Images/                   ← type: "listing_images"
│   │   ├── LI - Content for Upload/       ← type: "li_upload"
│   │   └── LI - Master Files/            ← type: "li_master"
│   ├── Storefront/                       ← type: "storefront"
│   │   ├── SF - Content for Upload/      ← type: "sf_upload"
│   │   └── SF - Master Files/            ← type: "sf_master"
│   ├── Brand Story/                      ← type: "brand_story"
│   │   ├── BS - Content for Upload/      ← type: "bs_upload"
│   │   └── BS - Master Files/            ← type: "bs_master"
│   ├── Amazon Posts/                     ← type: "amazon_posts"
│   │   ├── AP - Content for Upload/      ← type: "ap_upload"
│   │   └── AP - Master Files/            ← type: "ap_master"
│   └── Custom Creative Images/           ← type: "custom_creative"
│       ├── Lifestyle Images/             ← type: "lifestyle_images"
│       └── AI Generated Images/          ← type: "ai_images"
│
├── PPC/                                  ← type: "ppc"
│   ├── PPC Keywords research/           ← type: "ppc_keywords"
│   └── Records/                          ← type: "ppc_records"
│
├── SEO/                                  ← type: "seo"
│   ├── SEO Keywords research/            ← type: "seo_keywords"
│   └── SEO Files/                        ← type: "seo_files"
│
├── Research/                             ← type: "research"
├── Success/                             ← type: "success"
└── ZOld Files/                           ← type: "zold_files"
```

---

## How Folder Names Work in Drive

Inside Google Drive, folder names are **prefixed** with the `clientIdCode`:

- Root: `{clientIdCode}_{clientName}` (e.g. `ELK_SC_US_Elk Wellness`)
- Subfolders: `{clientIdCode}_{FolderName}` (e.g. `ELK_SC_US_Listing Images`)

---

## How to Reference a Folder (Database Lookup)

Every folder is stored in the `drive_folders` table. To get the Drive folder ID for a specific folder:

```typescript
import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Find a folder by client and folder type
const [folder] = await db
  .select({ driveFolderId: driveFolders.driveFolderId, name: driveFolders.name })
  .from(driveFolders)
  .where(and(
    eq(driveFolders.clientIdCode, "ELK_SC_US"),
    eq(driveFolders.folderType, "listing_images")  // Use the type from the tree above
  ))
  .limit(1);
```

### Folder Type Reference Table

| Folder (display name)         | `folderType`           | Path in DB                                 |
|-------------------------------|------------------------|--------------------------------------------|
| Client root                   | `client`               | `{clientIdCode}`                            |
| Amazon Documentation          | `amazon_documentation` | `{clientIdCode}/Amazon Documentation`       |
| Climate Pledge Friendly...    | `climate_pledge`       | `{clientIdCode}/Amazon Documentation/...`   |
| Client Resources              | `client_resources`      | `{clientIdCode}/Client Resources`           |
| Shortcuts                     | `shortcuts`             | `{clientIdCode}/Client Resources/...`       |
| Images                        | `resource_images`       | `{clientIdCode}/Client Resources/...`       |
| Videos                        | `resource_videos`       | `{clientIdCode}/Client Resources/...`       |
| Guidelines                    | `guidelines`            | `{clientIdCode}/Client Resources/...`       |
| Fonts                         | `fonts`                 | `{clientIdCode}/Client Resources/...`       |
| Certificates                  | `certificates`           | `{clientIdCode}/Client Resources/...`       |
| Graphics                      | `graphics`              | `{clientIdCode}/Graphics`                   |
| A+ Content                    | `aplus`                 | `{clientIdCode}/Graphics/A+ Content`        |
| Listing Images                | `listing_images`        | `{clientIdCode}/Graphics/Listing Images`    |
| LI - Content for Upload       | `li_upload`             | `{clientIdCode}/Graphics/Listing Images/...`|
| LI - Master Files             | `li_master`             | `{clientIdCode}/Graphics/Listing Images/...`|
| Storefront                    | `storefront`            | `{clientIdCode}/Graphics/Storefront`        |
| SF - Content for Upload       | `sf_upload`             | `{clientIdCode}/Graphics/Storefront/...`    |
| SF - Master Files             | `sf_master`             | `{clientIdCode}/Graphics/Storefront/...`    |
| Brand Story                   | `brand_story`           | `{clientIdCode}/Graphics/Brand Story`        |
| BS - Content for Upload       | `bs_upload`             | `{clientIdCode}/Graphics/Brand Story/...`    |
| BS - Master Files             | `bs_master`             | `{clientIdCode}/Graphics/Brand Story/...`    |
| Amazon Posts                  | `amazon_posts`          | `{clientIdCode}/Graphics/Amazon Posts`       |
| AP - Content for Upload       | `ap_upload`             | `{clientIdCode}/Graphics/Amazon Posts/...`  |
| AP - Master Files             | `ap_master`             | `{clientIdCode}/Graphics/Amazon Posts/...`  |
| Custom Creative Images         | `custom_creative`       | `{clientIdCode}/Graphics/Custom Creative...`|
| Lifestyle Images              | `lifestyle_images`      | `{clientIdCode}/Graphics/...`               |
| AI Generated Images           | `ai_images`             | `{clientIdCode}/Graphics/...`               |
| PPC                           | `ppc`                   | `{clientIdCode}/PPC`                        |
| PPC Keywords research         | `ppc_keywords`          | `{clientIdCode}/PPC/...`                    |
| Records                       | `ppc_records`           | `{clientIdCode}/PPC/...`                    |
| SEO                           | `seo`                   | `{clientIdCode}/SEO`                        |
| SEO Keywords research         | `seo_keywords`          | `{clientIdCode}/SEO/...`                    |
| SEO Files                     | `seo_files`             | `{clientIdCode}/SEO/...`                    |
| Research                      | `research`              | `{clientIdCode}/Research`                   |
| Success                       | `success`               | `{clientIdCode}/Success`                    |
| ZOld Files                    | `zold_files`             | `{clientIdCode}/ZOld Files`                 |

---

## Drive Client — How to Create/Fetch Folders

See `src/lib/drive-client.ts` for the `createFolder(name, parentDriveId)` method.

```typescript
import { driveClient } from "@/lib/drive-client";

// Create a folder
const folder = await driveClient.createFolder("My Folder Name", parentDriveId);
// Returns: { id: "drive-folder-id", name: "...", mimeType: "application/vnd.google-apps.folder" }
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/onboarding/folder-tree.ts` | Static default folder tree definition |
| `src/lib/onboarding/create-drive-folders.ts` | Recursive folder creation logic |
| `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts` | API endpoint that triggers folder creation |
| `src/app/admin/drive-folder-config/page.tsx` | UI to customize the folder tree (admin only) |
| `src/lib/db/schema.ts` | `drive_folders` table definition |
| `src/lib/drive-client.ts` | Google Drive API client (createFolder, uploadFile, etc.) |
| `src/lib/drive-upload.ts` | Upload helpers that resolve folder IDs by type |

---

## A+ Content Subfolders (On-Demand)

A+ Content subfolders (Premium A+, Basic A+) are **NOT** created during onboarding. They are created on-demand by `resolveAplusFolder()` in `src/lib/drive-upload.ts` when uploading A+ content.
