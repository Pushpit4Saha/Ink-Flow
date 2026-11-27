# Project Spec: Annotation Extension + Notes Website

> App name: **[APP_NAME]** (placeholder — replace before publishing)

## 1. What we are building

A Grammarly-style tool for annotating anything a person reads on the web or in PDFs.

- The user selects any word or sentence on any web page or PDF.
- A small floating button appears next to the selection.
- Clicking it opens a **sticky note** popup:
  - **Title** = the selected text (editable)
  - **Body** = rich text the user writes (meaning, explanation, thoughts)
  - Can attach **photos** (upload or paste from clipboard)
  - Can pick **tags** and a **folder**
  - **AI suggestion**: while the note is open, a greyed-out "ghost text" suggestion for the meaning/definition appears in the body (like GitHub Copilot). Press **Tab** to accept, keep typing to ignore.
- The note auto-saves with: source URL, page title, site favicon, date/time, and the surrounding sentence for context.
- A persistent round button (bottom-right of every page, like Grammarly) opens a mini panel showing notes for the current page. The user can hide it per site or globally.
- When the user revisits a page or PDF, the previously noted text is **highlighted**; hovering/clicking a highlight shows the note.
- A **website dashboard** shows all notes as sticky-note cards, works on laptop AND mobile, and supports search, filters, export and sharing.
- Anyone can sign up (public product), so multi-user auth and per-user data privacy are required.

## 2. Tech stack (use these unless there is a strong reason not to)

| Part | Choice | Why |
|---|---|---|
| Browser extension | **WXT** framework + TypeScript + React, Manifest V3 | One codebase builds for Chrome, Edge, Firefox, Brave, Opera, and Safari |
| Content-script UI | React inside a **Shadow DOM** | So page CSS never breaks our popup and our CSS never breaks the page |
| Website | **Next.js (App Router)** + TypeScript + Tailwind CSS + shadcn/ui | Fast to build, responsive |
| Mobile | The website as a **PWA** (installable on phone home screen) | No separate native app needed for now |
| Backend | **Supabase**: Postgres, Auth (email + Google login), Storage (photos, uploaded PDFs), Realtime | Free tier, auth + database + files in one place |
| Rich text editor | **Tiptap** | Used in both the extension popup and the website |
| PDF viewer | **PDF.js** (pdfjs-dist) bundled inside the extension | Browsers' built-in PDF viewers block extensions |
| Re-highlighting | W3C Web Annotation selectors (TextQuoteSelector + TextPositionSelector), e.g. `@apache-annotator/dom` | Robust re-anchoring when pages change slightly |
| AI suggestions | A Next.js API route that calls an LLM API (key kept server-side, never in the extension) | Keeps the API key secret; allows rate limiting |
| Export | `docx` npm package for Word; `@react-pdf/renderer` (or print-to-PDF HTML) for PDF | |
| Hosting | Vercel (website), Supabase (backend) | |

## 3. Data model (Supabase / Postgres)

- `profiles` — id (= auth user id), display_name, avatar_url, created_at
- `folders` — id, user_id, name, parent_id (nullable, for nested folders), color, created_at
- `tags` — id, user_id, name, color
- `notes`
  - id, user_id, folder_id (nullable)
  - title (selected text), body_json (Tiptap JSON), body_text (plain text for search)
  - source_type: `web` | `pdf_online` | `pdf_local`
  - source_url, page_title, favicon_url
  - pdf_fingerprint (PDF.js document fingerprint, so local PDFs are recognised again), pdf_page_number
  - anchor (JSONB: text quote selector {exact, prefix, suffix} + text position selector)
  - context_sentence
  - highlight_color
  - is_public (bool), share_slug (unique, nullable)
  - created_at, updated_at
- `note_tags` — note_id, tag_id
- `note_images` — id, note_id, storage_path, width, height
- `pdf_files` — id, user_id, storage_path, fingerprint, file_name (for PDFs uploaded to the dashboard)
- `shared_collections` — id, user_id, folder_id or tag_id, share_slug, is_public

**Row Level Security on every table**: users can only read/write their own rows; anyone can read rows where `is_public = true` (via share slug).

Full-text search index on `title` + `body_text`.

## 4. Extension behaviour details

- **Selection button**: appears on `mouseup` / `selectionchange` when selection is non-empty, positioned near the selection end. Must not appear inside input fields, our own UI, or password fields. Keyboard shortcut alternative: `Ctrl/Cmd+Shift+Y` (configurable).
- **Sticky note popup**: draggable, resizable, auto-saves (debounced), works offline — queue saves in `chrome.storage.local` / IndexedDB and sync when back online.
- **Floating round button**: bottom-right, draggable to another edge, shows a badge with the number of notes on this page. Right-click or settings to disable on a site.
- **Auth in extension**: user logs in via the website; the extension receives the Supabase session securely (e.g. via a login page that messages the extension, using `externally_connectable` or a redirect flow). Never store the service-role key in the extension.
- **Re-highlighting**: on page load, fetch notes for the normalised URL (strip tracking params like `utm_*`), re-anchor using the stored selectors, wrap matches in `<mark>`-style highlights. If a note cannot be re-anchored, show it in the side panel as "orphaned" rather than failing silently. Must handle dynamic pages (use MutationObserver with debouncing).
- **PDFs**:
  - Online PDFs: detect PDF URLs/content-type and offer to open them in our PDF.js viewer page inside the extension (with an option to do this automatically).
  - Local PDFs: user can (a) drag-drop/open a file in our viewer page, or (b) upload it to the dashboard. Explain in onboarding that `file://` access must be enabled in extension settings if they want to open local files directly.
  - Recognise the same PDF later using the PDF.js fingerprint so highlights reappear.
- **Permissions**: request the minimum needed. Explain clearly in onboarding why "read and change data on all websites" is needed.

## 5. AI suggestion behaviour

- Triggered when a note is opened (debounced; only if body is empty or user pauses typing for ~600 ms).
- Send: selected text + context sentence + page title (NOT the whole page).
- Prompt the model for a short, plain definition/meaning appropriate to the context (1–3 sentences).
- Show as grey ghost text; **Tab** accepts, **Esc** dismisses, typing continues normally.
- Settings: on/off toggle, preferred language for explanations (e.g. English, Bangla).
- Rate limit per user (e.g. per day) on the server route. Cache results for identical (text + context).

## 6. Website / dashboard

- **Home**: grid of sticky-note cards (title, first lines of body, thumbnail if image, favicon + site name, date, tags). Masonry layout on desktop, single column on mobile.
- **Sidebar**: folders (nested, drag notes into folders), tags, "By website" grouping, "PDFs" section.
- **Search** across title + body; filters by tag, folder, website, date range, source type.
- **Note detail**: full editor, images, link "Open source" that opens the original page and scrolls to the highlight (pass note id in URL hash so the extension can scroll to it).
- **PDF library**: list uploaded PDFs; open in an in-browser PDF.js viewer with highlights (so notes on PDFs are readable on mobile too).
- **Export**: select notes / a folder / a tag / one source → export as **Word (.docx)** or **PDF**. Layout: title (selected text) in bold, note body, images, source link + date, grouped by source or folder. Include a cover title and date.
- **Sharing**: share a single note, a folder, or a tag via a public read-only link (`/s/[slug]`); toggle off anytime.
- **Settings**: profile, AI on/off and language, highlight colours, disabled sites, delete account and all data.
- **PWA**: manifest, icons, offline read access to recently viewed notes.

## 7. Build stages — do ONE stage at a time

Stop after each stage, tell me how to test it, and wait for my confirmation.

1. **Setup + minimal working loop**: monorepo (`/extension`, `/web`, shared `/packages/types`), Supabase project schema + RLS, email/Google login on the website, extension login. Select text → button → simple note (title + plain text) → saves to Supabase → appears on dashboard. Chrome only for now.
2. **Rich notes**: Tiptap editor, photo upload/paste, tags, folders, the floating round button + per-page side panel, search and filters on dashboard.
3. **Re-highlighting** on revisit, with orphaned-note handling and "open source and scroll to highlight".
4. **PDFs**: PDF.js viewer in extension (online + local), fingerprint matching, PDF library and viewer on dashboard.
5. **AI ghost-text suggestions** with server route, rate limit, settings.
6. **Export** to Word and PDF; **sharing** via public links.
7. **Mobile/PWA polish** and **cross-browser builds**: Edge, Firefox, Brave/Opera, then Safari (via WXT + Xcode). Offline sync queue.
8. **Publishing prep**: privacy policy page, terms page, store listing assets/descriptions for Chrome Web Store, Edge Add-ons, Firefox Add-ons, Safari App Store; production env setup.

## 8. Rules for the code

- TypeScript everywhere, strict mode.
- Never put secrets (service-role key, LLM key) in the extension or client code. Use `.env` files and list required variables in `README.md`.
- Write a clear `README.md` with step-by-step setup for a non-expert (how to create the Supabase project, run migrations, load the unpacked extension, run the website).
- Keep components small; reuse the editor and note card between extension and web via the shared package.
- Handle errors visibly (toast messages), never fail silently.
- After each stage, list what was built, how to test it, and any manual steps I must do (e.g. create accounts, add keys).

## 9. Design (decided)

- **Logo:** pink circle with a white cherry-blossom outline (`design/logo.png`, original in `design/logo-original.jpg`). Used for the floating button, the selection button, the extension icon and the website/app icons.
- **Colours:** main pink `#C5777C` (hover `#A85D62`), green `#77C599`, blue `#77A3C5` (+ yellow `#F2C94C` as a 4th note colour). Notes use a light tint of their colour as "paper".
- **Fonts:** text in **Inter** (default) or **Times New Roman**; note titles in a cute font the user picks: **Lobster** (default), **Pacifico**, **Grand Hotel**, **Fredericka the Great** (or plain Inter). Fonts are self-hosted (no Google Fonts calls).
