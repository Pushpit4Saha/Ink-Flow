import type { Note } from './types';

export const NOTE_SELECT = '*, note_tags(tags(name)), note_images(id, storage_path)';
export const IMG_BUCKET = 'note-images';

export const publicImageUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${path}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNote(row: any): Note {
  const { note_tags, note_images, ...rest } = row;
  return {
    ...rest,
    tags: (note_tags ?? []).map((nt: { tags: { name: string } | null }) => nt.tags?.name).filter(Boolean),
    images: (note_images ?? []).map((im: { id: string; storage_path: string }) => ({
      id: im.id,
      path: im.storage_path,
      url: publicImageUrl(im.storage_path),
    })),
  } as Note;
}

export function hostOf(url: string | null): string {
  if (!url) return 'Unknown';
  if (url.startsWith('local-pdf://')) return 'Local PDFs';
  try {
    const u = new URL(url);
    return u.protocol === 'file:' ? 'Local PDFs' : u.hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

export function niceDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A short random id for share links */
export function makeSlug() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => a[b % a.length]).join('');
}

/** Link back to where the note was made (scrolls to the highlight on web pages) */
export function sourceLink(n: Note): string | null {
  if (!n.source_url || n.source_url.startsWith('local-pdf://')) return null;
  if (n.source_type === 'web') return `${n.source_url}#annot-note=${n.id}`;
  return n.source_url;
}
