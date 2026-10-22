# Drive Folder Tree

Editable Drive folder structure used by client onboarding. Admin-only UI at `/admin/drive-folder-config`. The tree determines which folders are created in Google Drive when an admin runs the `drive_folders` step on a client's onboarding page.

## Behaviour

- Admin opens `/admin/drive-folder-config` (or clicks `✎ Edit folder structure` inside the Drive Folders onboarding step).
- The page loads the current tree from `folder_tree_config` (single-row table, id = 1). If the row is missing, the static seed `CLIENT_FOLDER_TREE` from `src/lib/onboarding/folder-tree.ts` is shown instead.
- Each node has `name` (display) and `type` (DB key — must be unique across the tree). Editing the name auto-derives a slugified type until the type is hand-edited.
- Add child / remove / expand-collapse work at any depth.
- Save persists the JSON tree, stamps `updated_at` and `updated_by`. Duplicate types block save with an inline warning.
- New clients running `drive_folders` get the latest tree. Existing clients are not auto-updated — re-run their `drive_folders` step (idempotent: existing folders are skipped, only new ones are created in Drive).

## Architecture

```
DB:    folder_tree_config (id=1, tree JSONB, updated_at, updated_by)
API:   src/app/api/admin/folder-tree/route.ts        — GET / PUT (admin-only)
UI:    src/app/admin/drive-folder-config/page.tsx    — nested tree editor
Lib:   src/lib/onboarding/create-drive-folders.ts    — loadFolderTree() reads DB → falls back to CLIENT_FOLDER_TREE
Seed:  src/lib/onboarding/folder-tree.ts             — static FolderNode[] used when DB row is empty
```

Folder creation itself is unchanged: `createClientDriveFolders()` recursively walks the tree, calling `ensureFolder()` which checks `drive_folders` table first and creates the Drive folder + records the row only if missing. Folder names follow the convention `{clientIdCode}_{folderName}`.

## Adding a folder

1. Open `/admin/drive-folder-config`.
2. Click `+` next to a parent (or `Add root folder`) to add a new node.
3. Set the `name` (Drive display name) and confirm/edit the `type` (used for DB lookups, e.g. `seo_files`, `reports`).
4. Save. The change is live for any client whose `drive_folders` step runs after the save.
5. To roll out to existing clients, re-run their `drive_folders` step from `/clients/{clientIdCode}/onboarding`.

## Notes

- `type` is the lookup key in `drive_folders.folder_type`. Renaming a `type` orphans references — avoid for already-deployed types.
- Removing a node here does **not** delete the folder in Google Drive or the row in `drive_folders`. Cleanup is manual.
- The static `CLIENT_FOLDER_TREE` in code remains the seed for first-time setup and disaster recovery; once the DB has a row it takes precedence.
