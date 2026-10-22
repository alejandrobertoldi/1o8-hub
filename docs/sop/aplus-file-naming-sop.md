# A+ Content File Naming & Folder Structure — SOP

> Standard Operating Procedure for naming and organizing A+ Content image and video files in Google Drive.

---

## 1. Overview

All A+ Content assets (images, videos) are stored in Google Drive under a structured hierarchy that encodes: **client**, **marketplace**, **platform**, **content type**, **product scope**, **version**, **module position**, **module type**, **slot**, and **device**.

This system ensures every file is:
- **Self-describing** — you can identify what it is from the filename alone
- **Sortable** — files sort in module order naturally
- **Versionable** — new versions get new folders; in-place edits overwrite within a version
- **Searchable** — consistent patterns make Drive search reliable

---

## 2. Google Drive Folder Hierarchy

```
{clientIdCode}-{marketplace}-{platform}/
  {clientIdCode}-{marketplace}-{platform}-Graphics/
    {clientIdCode}-{marketplace}-{platform}-A+/
      PA+/
        {scopePrefix}_{identifier}/
          v{##}/
            (image and video files)
      BA+/
        (same structure — future)
```

### Example

```
DRC-US-SC/
  DRC-US-SC-Graphics/
    DRC-US-SC-A+/
      PA+/
        ASIN_B0D4JRQ13R/
          v01/
            B0D4JRQ13R_V01_M1_PFI_GEN_DV_IMG.png
            B0D4JRQ13R_V01_M1_PFI_GEN_MV_IMG.png
            B0D4JRQ13R_V01_M2_PBIT_GEN_DV_IMG.png
            ...
```

### Segment definitions

| Segment        | Source                 | Examples                                                    |
|----------------|------------------------|-------------------------------------------------------------|
| `clientIdCode` | AAC client record      | `DRC`, `PBN`, `AHC`                                        |
| `marketplace`  | Amazon marketplace code| `US`, `CA`, `MX`, `UK`, `DE`, `FR`, `IT`, `ES`, `JP`, `AU` |
| `platform`     | Selling platform       | `SC` (Seller Central), `VC` (Vendor Central)                |

---

## 3. Content Type Folders

| Folder | Content                                     |
|--------|---------------------------------------------|
| `PA+/` | Premium A+ Content (19 module types)        |
| `BA+/` | Basic A+ Content (future — same structure)  |

---

## 4. Scope — Product Coverage

Each A+ set targets a specific product scope. The scope determines the folder name under `PA+/` or `BA+/`.

| Scope prefix | Meaning                      | Identifier                      | Example folder       |
|--------------|------------------------------|---------------------------------|----------------------|
| `ASIN`       | Single product               | The product ASIN                | `ASIN_B0D4JRQ13R/`  |
| `VAR`        | Full variation family        | Variation ID (group identifier) | `VAR_VG00012345/`    |
| `GRP`        | Subset of a variation family | Auto-generated slug (see below) | `GRP_rrescue2/`      |

### GRP slug auto-generation rule

When the A+ set covers a subset of a variation family:

1. Take the **product line name** (e.g., "ReadyRESCUE")
2. Lowercase, remove spaces and special characters, truncate to **max 8 characters**
3. Append the **number of ASINs** covered

| Product line   | ASINs covered       | GRP slug    |
|----------------|---------------------|-------------|
| ReadyRESCUE    | 2 (1-vial + 3-vial) | `rrescue2`  |
| Calming Spray  | 3                   | `calmspry3` |
| Immune Support | 5                   | `immunsup5` |

The slug is auto-suggested from product data. The user can accept or edit before creation. The specific ASINs covered by a GRP are tracked in the database, not in the folder name.

---

## 5. Versioning

```
ASIN_B0D4JRQ13R/
  v01/      <- version 1 (original)
  v02/      <- version 2 (revision)
```

- Versions use **two-digit zero-padded numbers** everywhere: folders `v01`, `v02` and filenames `V01`, `V02`, ..., `V99`
- Each version is a **complete folder** with all files for that version
- **New version** = new folder with a fresh set of files
- **In-place edit** (same version) = overwrite the existing file after confirmation

### When to create a new version vs. edit in-place

| Scenario                               | Action                                       |
|----------------------------------------|----------------------------------------------|
| Client requests a tweak to one image   | Edit in-place (overwrite in current version) |
| Major redesign or new creative direction | New version folder                           |
| Seasonal/promotional variant           | New version folder                           |

---

## 6. File Naming Convention

### Image files

```
{scopeId}_V{##}_M{#}_{typeCode}_{scope}{panNum}_{device}_{suffix}.png
```

All images are **PNG**. Always.

### Text field / metadata references

```
{scopeId}_V{##}_M{#}_{typeCode}_{scope}{panNum}_{fieldAbbr}_{groupAbbr}
```

### Segment definitions

| Segment       | Description                         | Format               | Examples                                |
|---------------|-------------------------------------|-----------------------|-----------------------------------------|
| `{scopeId}`   | ASIN, Variation ID, or GRP slug     | As-is from scope      | `B0DCLWMB4Y`, `VG00012345`, `rrescue2` |
| `V{##}`       | Version number                      | Zero-padded           | `V01`, `V02`, `V10`                    |
| `M{#}`        | Module position in the A+ set       | Not padded            | `M1`, `M7`, `M15`                      |
| `{typeCode}`  | Module type abbreviation (P prefix) | 2-4 uppercase chars   | `PFI`, `PBIT`, `PSIC`                  |
| `{scope}`     | GEN (module-level) or PAN (panel)   |                       | `GEN`, `PAN1`, `PAN3`                  |
| `{fieldAbbr}` | Text field abbreviation             | 4 chars               | `HEAD`, `BODY`, `BUTT`, `ALTE`         |
| `{device}`    | Device variant (images only)        | `DV` or `MV`          | `DV` (Desktop), `MV` (Mobile)          |
| `{suffix}`    | Image type                          | `IMG`, `VID`, `PREV`  |                                         |

### Text field abbreviations

| Abbreviation | Meaning                        |
|--------------|--------------------------------|
| `HEAD`       | Headline                       |
| `SUBH`       | Subheadline                    |
| `BODY`       | Body text                      |
| `BUTT`       | Button text                    |
| `ASIN`       | ASIN                           |
| `ALTE`       | Alt text (per image)           |
| `AIIP`       | AI image prompt (per image)    |
| `IMDE`       | Image description (per image)  |
| `NAVT`       | Navigation text                |
| `QUES`       | Question                       |
| `ANSW`       | Answer                         |
| `METR`       | Metric                         |

### Video files

Video files use `.mp4` extension and have no device suffix (videos are universal):

```
{scopeId}_V{##}_M{#}_{typeCode}_VIDEO.mp4
{scopeId}_V{##}_M{#}_{typeCode}_PREV_DV.png
{scopeId}_V{##}_M{#}_{typeCode}_PREV_MV.png
```

---

## 7. Module Type Codes

| Module type              | Code   | Has images    | Has video |
|--------------------------|--------|---------------|-----------|
| Background Image Text    | `PBIT` | Yes           | No        |
| Comparison Table 1       | `PCT1` | Yes           | No        |
| Comparison Table 2       | `PCT2` | Yes           | No        |
| Comparison Table 3       | `PCT3` | Yes           | No        |
| Dual Images Text         | `PDIT` | Yes           | No        |
| Four Images Text         | `PFIT` | Yes           | No        |
| Full Image               | `PFI`  | Yes           | No        |
| Full Video               | `PFV`  | Yes (preview) | Yes       |
| Hotspots 1               | `PHS1` | Yes           | No        |
| Hotspots 2               | `PHS2` | Yes           | No        |
| Navigation Carousel      | `PNC`  | Yes           | No        |
| Q&A                      | `PQA`  | No            | No        |
| Regimen Carousel         | `PRC`  | Yes           | No        |
| Simple Image Carousel    | `PSIC` | Yes           | No        |
| Single Image Text        | `PSIT` | Yes           | No        |
| Technical Specifications | `PTS`  | No            | No        |
| Text                     | `PTXT` | No            | No        |
| Video Image Carousel     | `PVIC` | Yes           | Yes       |
| Video Text               | `PVT`  | Yes (preview) | Yes       |

---

## 8. Slot Keys per Module Type

### Fixed-slot modules (non-repeatable images)

| Module                | Code   | Slot keys                      | Desktop size | Mobile size |
|-----------------------|--------|--------------------------------|--------------|-------------|
| Full Image            | `PFI`  | `MAIN`                         | 1464x600     | 600x450     |
| Background Image Text | `PBIT` | `BG`                           | 1464x600     | 600x450     |
| Single Image Text     | `PSIT` | `IMG`                          | 800x600      | —           |
| Dual Images Text      | `PDIT` | `IMG1`, `IMG2`                 | 650x350      | —           |
| Four Images Text      | `PFIT` | `IMG1`, `IMG2`, `IMG3`, `IMG4` | 300x225      | —           |

### Comparison tables

| Module             | Code   | Slot keys                | Size                        |
|--------------------|--------|--------------------------|-----------------------------|
| Comparison Table 1 | `PCT1` | `HERO`, `COMP1`–`COMP6` | 200x225                     |
| Comparison Table 2 | `PCT2` | `COMP1`–`COMP3`         | 300x225                     |
| Comparison Table 3 | `PCT3` | `HERO`, `COMP1`–`COMP4` | 488x700 (dt), 600x450 (mb) |

### Hotspots

| Module     | Code   | Slot keys           | Size                          |
|------------|--------|---------------------|-------------------------------|
| Hotspots 1 | `PHS1` | `BG` + `SP1`–`SP6` | BG: 1464x600, spots: 600x450 |
| Hotspots 2 | `PHS2` | `BG` + `SP1`–`SP8` | BG: 1464x600, spots: 600x450 |

### Carousels (repeatable — numbered slots)

| Module                | Code   | Slot key pattern | Range | Size                         |
|-----------------------|--------|------------------|-------|------------------------------|
| Navigation Carousel   | `PNC`  | `PAN1`–`PAN5`   | 2-5   | 1464x600 (DV), 600x450 (MV) |
| Regimen Carousel      | `PRC`  | `PAN1`–`PAN5`   | 2-5   | 1464x600 (DV), 600x450 (MV) |
| Simple Image Carousel | `PSIC` | `PAN1`–`PAN6`   | 2-6   | 1464x600 (DV), 600x450 (MV) |
| Video Image Carousel  | `PVIC` | `PAN1`–`PAN6`   | 2-6   | 800x600 (DV), 600x450 (MV)  |

### Video modules

| Module               | Code   | Video file  | Preview slots         |
|----------------------|--------|-------------|-----------------------|
| Full Video           | `PFV`  | `VIDEO.mp4` | `PREV_DV`, `PREV_MV` |
| Video Image Carousel | `PVIC` | `VIDEO.mp4` | `PREV_DV`, `PREV_MV` |
| Video Text           | `PVT`  | `VIDEO.mp4` | `PREV_DV`, `PREV_MV` |

---

## 9. Module Reordering

`MOD#` always reflects the **current display position** in the A+ set.

When a module is reordered:
1. All files in the version folder are **batch renamed** to reflect new positions
2. A confirmation dialog is shown: *"Reordering will rename X files in Drive. Proceed?"*
3. Only the `MOD#` segment changes — the rest of the filename stays the same

### Example: Move module 3 to position 1

**Before:**
```
B0D4JRQ13R_V01_M1_PFI_GEN_DV_IMG.png
B0D4JRQ13R_V01_M2_PBIT_GEN_DV_IMG.png
B0D4JRQ13R_V01_M3_PCT1_HERO_DV.png     <- moving this to position 1
B0D4JRQ13R_V01_M3_PCT1_COMP1_DV.png
```

**After:**
```
B0D4JRQ13R_V01_M1_PCT1_HERO_DV.png     <- was M3
B0D4JRQ13R_V01_M1_PCT1_COMP1_DV.png    <- was M3
B0D4JRQ13R_V01_M2_PFI_GEN_DV_IMG.png   <- was M1
B0D4JRQ13R_V01_M3_PBIT_GEN_DV_IMG.png  <- was M2
```

---

## 10. Replace-in-Place Rules

When updating an image within the same version:
1. The new file uses the **exact same filename**
2. The existing file in Drive is **overwritten**
3. A confirmation dialog is shown: *"Replace B0D4JRQ13R_V01_M1_PFI_GEN_DV_IMG.png in v01?"*
4. No version bump needed for minor tweaks

---

## 11. Complete Examples

### Example 1: Single ASIN, 7-module PA+ set

**Client:** Dr Cuddles (DRC) | **Marketplace:** US | **Platform:** SC
**Product:** ReadyRESCUE 1-vial (B0D4JRQ13R)

```
DRC-US-SC/
  DRC-US-SC-Graphics/
    DRC-US-SC-A+/
      PA+/
        ASIN_B0D4JRQ13R/
          v01/
            B0D4JRQ13R_V01_M1_PFI_GEN_DV_IMG.png
            B0D4JRQ13R_V01_M1_PFI_GEN_MV_IMG.png
            B0D4JRQ13R_V01_M2_PBIT_GEN_DV_IMG.png
            B0D4JRQ13R_V01_M2_PBIT_GEN_MV_IMG.png
            B0D4JRQ13R_V01_M3_PFV_VIDEO.mp4
            B0D4JRQ13R_V01_M3_PFV_PREV_DV.png
            B0D4JRQ13R_V01_M3_PFV_PREV_MV.png
            B0D4JRQ13R_V01_M4_PCT1_HERO_DV.png
            B0D4JRQ13R_V01_M4_PCT1_COMP1_DV.png
            B0D4JRQ13R_V01_M4_PCT1_COMP2_DV.png
            B0D4JRQ13R_V01_M4_PCT1_COMP3_DV.png
            B0D4JRQ13R_V01_M5_PNC_PAN1_DV_IMG.png
            B0D4JRQ13R_V01_M5_PNC_PAN1_MV_IMG.png
            B0D4JRQ13R_V01_M5_PNC_PAN2_DV_IMG.png
            B0D4JRQ13R_V01_M5_PNC_PAN2_MV_IMG.png
            B0D4JRQ13R_V01_M5_PNC_PAN3_DV_IMG.png
            B0D4JRQ13R_V01_M5_PNC_PAN3_MV_IMG.png
            B0D4JRQ13R_V01_M6_PSIT_GEN_DV_IMG.png
            B0D4JRQ13R_V01_M7_PTXT
```

(M7_PTXT has no files — text-only module)

### Example 2: Simple Image Carousel detail

**Module 3 of a set — Premium Simple Image Carousel with 4 panels:**

Text field rows:
```
B0DCLWMB4Y_V01_M3_PSIC_GEN_HEAD_          (General Headline)
B0DCLWMB4Y_V01_M3_PSIC_GEN_BODY_          (General Body Text)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_HEAD_         (Panel 1 Headline)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_BODY_         (Panel 1 Body Text)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_BUTT_         (Panel 1 Button Text)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_ASIN_         (Panel 1 ASIN)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_ALTE_         (Panel 1 Alt Text)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_AIIP_         (Panel 1 AI Image Prompt)
B0DCLWMB4Y_V01_M3_PSIC_PAN1_IMDE_         (Panel 1 Image Description)
... (repeat PAN2-PAN4)
```

Image rows:
```
B0DCLWMB4Y_V01_M3_PSIC_PAN1_DV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN1_MV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN2_DV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN2_MV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN3_DV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN3_MV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN4_DV_IMG.png
B0DCLWMB4Y_V01_M3_PSIC_PAN4_MV_IMG.png
```

### Example 3: Variation family PA+

**Client:** Dr Cuddles (DRC) | **Marketplace:** US | **Platform:** SC
**Variation:** Full ReadyRESCUE family (VG00012345)

```
DRC-US-SC/
  DRC-US-SC-Graphics/
    DRC-US-SC-A+/
      PA+/
        VAR_VG00012345/
          v01/
            VG00012345_V01_M1_PFI_GEN_DV_IMG.png
            VG00012345_V01_M1_PFI_GEN_MV_IMG.png
            ...
```

### Example 4: GRP subset

**Client:** Dr Cuddles (DRC) | **Marketplace:** US | **Platform:** SC
**Subset:** ReadyRESCUE 1-vial + 3-vial only

```
DRC-US-SC/
  DRC-US-SC-Graphics/
    DRC-US-SC-A+/
      PA+/
        GRP_rrescue2/
          v01/
            rrescue2_V01_M1_PFI_GEN_DV_IMG.png
            ...
```

### Example 5: Vendor Central, different marketplace

**Client:** PBN | **Marketplace:** UK | **Platform:** VC

```
PBN-UK-VC/
  PBN-UK-VC-Graphics/
    PBN-UK-VC-A+/
      PA+/
        ASIN_B09XYZ1234/
          v01/
            B09XYZ1234_V01_M1_PFI_GEN_DV_IMG.png
            ...
```

---

## 12. Quick Reference Card

```
FOLDER:   {client}-{mkt}-{plat}/{client}-{mkt}-{plat}-Graphics/{client}-{mkt}-{plat}-A+/PA+/{scope}_{id}/v{##}/
IMAGE:    {scopeId}_V{##}_M{#}_{typeCode}_{scope}{panNum}_{device}_IMG.png
TEXT:     {scopeId}_V{##}_M{#}_{typeCode}_{scope}{panNum}_{fieldAbbr}_
VIDEO:    {scopeId}_V{##}_M{#}_{typeCode}_VIDEO.mp4
PREVIEW:  {scopeId}_V{##}_M{#}_{typeCode}_PREV_{device}.png

Scopes:   ASIN_{asin}  |  VAR_{variationId}  |  GRP_{slug+count}
Devices:  DV (Desktop Version)  |  MV (Mobile Version)  |  none (video)
Fields:   HEAD  |  BODY  |  SUBH  |  BUTT  |  ASIN  |  ALTE  |  AIIP  |  IMDE
Codes:    P prefix = Premium (PSIC, PBIT, PFI, PFV, etc.)
Format:   Always .png for images  |  .mp4 for video
```
