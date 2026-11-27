export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export interface Note {
  id: string;
  title: string;
  body_text: string;
  body_json: unknown | null;
  source_type: 'web' | 'pdf_online' | 'pdf_local';
  source_url: string | null;
  page_title: string | null;
  favicon_url: string | null;
  context_sentence: string | null;
  anchor: TextAnchor | null;
  highlight_color: string | null;
  folder_id: string | null;
  pdf_fingerprint: string | null;
  pdf_page_number: number | null;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  images: { id: string; path: string; url: string }[];
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
export interface Profile {
  id: string;
  display_name: string | null;
  ai_enabled: boolean;
  ai_language: string;
  highlight_color: string;
  title_font: string;
  body_font: string;
}
export interface PdfFile {
  id: string;
  storage_path: string;
  fingerprint: string | null;
  file_name: string | null;
  created_at: string;
}
export interface SharedCollection {
  id: string;
  folder_id: string | null;
  tag_id: string | null;
  share_slug: string;
  is_public: boolean;
}
