// Shared types used by the background, popup, content script and PDF viewer.

export interface TextAnchor {
  exact: string; // the selected text
  prefix: string; // ~64 characters before it (helps find it again later)
  suffix: string; // ~64 characters after it
  start: number; // character offset in the page text (fallback)
  end: number;
}

export type SourceType = 'web' | 'pdf_online' | 'pdf_local';

export interface NewNote {
  title: string;
  body_text: string;
  body_json: unknown | null; // Tiptap JSON
  source_type: SourceType;
  source_url: string;
  page_title: string;
  favicon_url: string | null;
  context_sentence: string | null;
  anchor: TextAnchor | null;
  highlight_color: string;
  folder_id: string | null;
  pdf_fingerprint: string | null;
  pdf_page_number: number | null;
}

export interface SaveNotePayload {
  note: NewNote;
  tags: string[]; // tag names (created if new)
  newFolderName?: string | null; // create a folder and put the note in it
  images: string[]; // data: URLs of photos to upload
}

export interface Note extends NewNote {
  id: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  images: string[]; // public URLs
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}
export interface Tag {
  id: string;
  name: string;
}
export interface Settings {
  ai_enabled: boolean;
  ai_language: string;
  highlight_color: string;
  title_font: string; // Lobster, Pacifico, Grand Hotel, Fredericka the Great or Inter
  body_font: string; // Inter or Times New Roman
}
export interface Meta {
  folders: Folder[];
  tags: Tag[];
  settings: Settings;
}

export interface UserInfo {
  id: string;
  email: string | null;
}

// Messages sent to the background service worker
export type BgMessage =
  | { type: 'GET_USER' }
  | { type: 'SIGN_IN'; email: string; password: string }
  | { type: 'SIGN_UP'; email: string; password: string }
  | { type: 'SIGN_OUT' }
  | { type: 'GET_META' }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'SAVE_NOTE'; payload: SaveNotePayload }
  | { type: 'GET_NOTES'; url?: string; fingerprint?: string }
  | { type: 'SUGGEST'; text: string; context: string; title: string }
  | { type: 'OPEN_DASHBOARD'; path?: string }
  | { type: 'OPEN_PDF_VIEWER'; url?: string }
  | { type: 'QUEUE_STATUS' };

export type BgResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// Messages sent from the background to a tab's content script
export type TabMessage = { type: 'OPEN_NOTE_FOR_SELECTION' } | { type: 'NOTES_CHANGED' };

export const DEFAULT_SETTINGS: Settings = {
  ai_enabled: true,
  ai_language: 'English',
  highlight_color: '#D8A3A7',
  title_font: 'Lobster',
  body_font: 'Inter',
};

// Brand palette — pink is the main colour
export const BRAND = '#D8A3A7';

export const COLORS = [
  { hex: BRAND, name: 'Pink' },
  { hex: '#77C599', name: 'Green' },
  { hex: '#77A3C5', name: 'Blue' },
  { hex: '#F2C94C', name: 'Yellow' },
];

/** Solid colour of a note card. Old pink notes pick up the current brand pink. */
export function noteBlockColor(hex?: string | null): string {
  if (!hex || hex.toLowerCase() === '#c5777c') return BRAND;
  return hex;
}

/** Light "paper" tint for a note of a given colour. */
export function paperTint(hex: string, amount = 0.84): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return '#FBEEEF';
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
