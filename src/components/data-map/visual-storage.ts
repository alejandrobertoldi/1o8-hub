import { emptyWorkspace, parseVisualWorkspace, type VisualWorkspace } from '@/lib/data-map/visual-model';
import type { DataMap } from '@/lib/data-map/types';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Browser image storage is unavailable'));
    const request = indexedDB.open('mfhub-visual-data-map', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspaces');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
/** Recovery reads never render the unvalidated document; they are only for export. */
export async function readRawVisualWorkspace(key: string): Promise<unknown> {
  const db = await open();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const r = db.transaction('workspaces').objectStore('workspaces').get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
export async function loadVisualWorkspace(key: string, map: DataMap): Promise<VisualWorkspace> {
  const value = await readRawVisualWorkspace(key);
  return value ? parseVisualWorkspace(value, map) : emptyWorkspace();
}
export async function saveVisualWorkspace(key: string, workspace: VisualWorkspace): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readwrite');
      tx.objectStore('workspaces').put(workspace, key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Save aborted'));
    });
  } finally { db.close(); }
}
export function imageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10_000_000) return reject(new Error('Use a PNG, JPEG or WebP under 10 MB'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read image'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => img.naturalWidth <= 20000 && img.naturalHeight <= 50000 ? resolve({ src: String(reader.result), width: img.naturalWidth, height: img.naturalHeight }) : reject(new Error('Image dimensions are too large'));
      img.onerror = () => reject(new Error('Cannot decode image')); img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
