import type { SectionId } from '../types';

/**
 * Returns a 2-digit section number for the given id.
 * Counts from 1 at the first non-cover, non-toc id in the order list.
 * Returns "" if the id is not in the list, or is one of cover/toc.
 */
export function sectionNumber(sections: SectionId[], id: SectionId): string {
  if (id === 'cover' || id === 'toc') return '';
  const filtered = sections.filter(s => s !== 'cover' && s !== 'toc');
  const idx = filtered.indexOf(id);
  if (idx < 0) return '';
  return String(idx + 1).padStart(2, '0');
}
