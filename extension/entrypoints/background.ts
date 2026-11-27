import { defineBackground } from 'wxt/utils/define-background';
import { browser, type Browser } from 'wxt/browser';
import { supabase } from '../lib/supabase';
import { isConfigured, DASHBOARD_URL, SUPABASE_URL } from '../lib/config';
import { normalizeUrl } from '../lib/url';
import {
  DEFAULT_SETTINGS,
  type BgMessage,
  type BgResponse,
  type Meta,
  type Note,
  type SaveNotePayload,
  type Settings,
  type TabMessage,
  type UserInfo,
} from '../lib/types';

const IMG_BUCKET = 'note-images';
const QUEUE_KEY = 'saveQueue';
const NOTE_SELECT = '*, note_tags(tags(name)), note_images(storage_path)';

const publicImageUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${path}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNote(row: any): Note {
  const { note_tags, note_images, ...rest } = row;
  return {
    ...rest,
    tags: (note_tags ?? []).map((nt: { tags: { name: string } | null }) => nt.tags?.name).filter(Boolean),
    images: (note_images ?? []).map((im: { storage_path: string }) => publicImageUrl(im.storage_path)),
  } as Note;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

function isNetworkError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed/i.test(m);
}

async function getSettings(uid: string): Promise<Settings> {
  const { data } = await supabase.from('profiles').select('ai_enabled,ai_language,highlight_color,title_font,body_font').eq('id', uid).maybeSingle();
  const s = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  // pages read fonts/colours from this copy, so they don't need to ask the server
  await browser.storage.local.set({ settingsCache: s });
  return s;
}

// ---------- saving (with offline queue) ----------
async function saveNoteNow(p: SaveNotePayload, uid: string): Promise<Note> {
  let folderId = p.note.folder_id;
  if (p.newFolderName?.trim()) {
    const { data, error } = await supabase.from('folders').insert({ name: p.newFolderName.trim() }).select('id').single();
    if (error) throw new Error(error.message);
    folderId = data.id;
  }

  const row = { ...p.note, folder_id: folderId, source_url: normalizeUrl(p.note.source_url) };
  const { data: note, error } = await supabase.from('notes').insert(row).select('id').single();
  if (error) throw new Error(error.message);

  const tagNames = [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))];
  if (tagNames.length) {
    const { data: tags, error: tErr } = await supabase
      .from('tags')
      .upsert(tagNames.map((name) => ({ user_id: uid, name })), { onConflict: 'user_id,name' })
      .select('id');
    if (tErr) throw new Error(tErr.message);
    await supabase.from('note_tags').insert(tags.map((t) => ({ note_id: note.id, tag_id: t.id })));
  }

  for (const dataUrl of p.images) {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const path = `${uid}/${note.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(IMG_BUCKET).upload(path, blob, { contentType: blob.type });
    if (up.error) throw new Error(up.error.message);
    await supabase.from('note_images').insert({ note_id: note.id, storage_path: path });
  }

  const { data: full, error: fErr } = await supabase.from('notes').select(NOTE_SELECT).eq('id', note.id).single();
  if (fErr) throw new Error(fErr.message);
  return mapNote(full);
}

async function readQueue(): Promise<SaveNotePayload[]> {
  const r = await browser.storage.local.get(QUEUE_KEY);
  return (r[QUEUE_KEY] as SaveNotePayload[] | undefined) ?? [];
}

let flushing = false;
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const uid = await currentUserId();
    if (!uid) return;
    let queue = await readQueue();
    while (queue.length) {
      try {
        await saveNoteNow(queue[0], uid);
      } catch (e) {
        if (isNetworkError(e)) break; // still offline — try later
        console.warn('Ink&Flow dropping queued note that cannot be saved:', e);
      }
      queue = queue.slice(1);
      await browser.storage.local.set({ [QUEUE_KEY]: queue });
    }
  } finally {
    flushing = false;
  }
}

// ---------- AI suggestions ----------
const suggestCache = new Map<string, string | null>();

async function suggest(text: string, context: string, title: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) return null;
  const settings = await getSettings(s.user.id);
  if (!settings.ai_enabled) return null;
  const key = `${settings.ai_language}|${text}|${context}`;
  if (suggestCache.has(key)) return suggestCache.get(key)!;
  const res = await fetch(`${DASHBOARD_URL}/api/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ text, context, title, language: settings.ai_language }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { suggestion: string | null };
  suggestCache.set(key, json.suggestion);
  if (suggestCache.size > 300) suggestCache.delete(suggestCache.keys().next().value!);
  return json.suggestion;
}

// ---------- message handler ----------
async function handle(msg: BgMessage, sender: Browser.runtime.MessageSender): Promise<BgResponse> {
  if (!isConfigured && msg.type !== 'OPEN_DASHBOARD' && msg.type !== 'OPEN_PDF_VIEWER') {
    return { ok: false, error: 'Extension is not configured yet. Add your Supabase URL and key to extension/.env and rebuild.' };
  }

  switch (msg.type) {
    case 'GET_USER': {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      const info: UserInfo | null = u ? { id: u.id, email: u.email ?? null } : null;
      return { ok: true, data: info };
    }

    case 'SIGN_IN': {
      const { data, error } = await supabase.auth.signInWithPassword({ email: msg.email, password: msg.password });
      if (error) return { ok: false, error: error.message };
      flushQueue();
      getSettings(data.user.id);
      return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
    }

    case 'SIGN_UP': {
      const { data, error } = await supabase.auth.signUp({
        email: msg.email,
        password: msg.password,
        options: { emailRedirectTo: `${DASHBOARD_URL}/auth/callback` },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { needsConfirm: !data.session } };
    }

    case 'SIGN_OUT': {
      await supabase.auth.signOut();
      return { ok: true, data: null };
    }

    case 'GET_META': {
      const uid = await currentUserId();
      if (!uid) return { ok: false, error: 'NOT_LOGGED_IN' };
      const [folders, tags, settings] = await Promise.all([
        supabase.from('folders').select('id,name,parent_id').order('name'),
        supabase.from('tags').select('id,name').order('name'),
        getSettings(uid),
      ]);
      const meta: Meta = { folders: folders.data ?? [], tags: tags.data ?? [], settings };
      return { ok: true, data: meta };
    }

    case 'SET_SETTINGS': {
      const uid = await currentUserId();
      if (!uid) return { ok: false, error: 'NOT_LOGGED_IN' };
      const { error } = await supabase.from('profiles').upsert({ id: uid, ...msg.settings });
      if (error) return { ok: false, error: error.message };
      const cached = ((await browser.storage.local.get('settingsCache')).settingsCache as Settings | undefined) ?? DEFAULT_SETTINGS;
      await browser.storage.local.set({ settingsCache: { ...cached, ...msg.settings } });
      suggestCache.clear();
      return { ok: true, data: null };
    }

    case 'SAVE_NOTE': {
      const uid = await currentUserId();
      if (!uid) return { ok: false, error: 'NOT_LOGGED_IN' };
      try {
        const note = await saveNoteNow(msg.payload, uid);
        flushQueue();
        return { ok: true, data: note };
      } catch (e) {
        if (isNetworkError(e)) {
          const q = await readQueue();
          await browser.storage.local.set({ [QUEUE_KEY]: [...q, msg.payload] });
          return { ok: true, data: { queued: true } };
        }
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case 'GET_NOTES': {
      const uid = await currentUserId();
      if (!uid) return { ok: true, data: [] };
      let q = supabase.from('notes').select(NOTE_SELECT).eq('user_id', uid).order('created_at', { ascending: false });
      if (msg.fingerprint) q = q.eq('pdf_fingerprint', msg.fingerprint);
      else if (msg.url) q = q.eq('source_url', normalizeUrl(msg.url));
      else return { ok: true, data: [] };
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: (data ?? []).map(mapNote) };
    }

    case 'SUGGEST': {
      try {
        return { ok: true, data: await suggest(msg.text, msg.context, msg.title) };
      } catch {
        return { ok: true, data: null };
      }
    }

    case 'OPEN_DASHBOARD': {
      await browser.tabs.create({ url: `${DASHBOARD_URL}${msg.path ?? '/dashboard'}` });
      return { ok: true, data: null };
    }

    case 'OPEN_PDF_VIEWER': {
      const viewer = browser.runtime.getURL('/pdf-viewer.html');
      const url = msg.url ? `${viewer}?file=${encodeURIComponent(msg.url)}` : viewer;
      if (msg.url && sender.tab?.id != null) await browser.tabs.update(sender.tab.id, { url });
      else await browser.tabs.create({ url });
      return { ok: true, data: null };
    }

    case 'QUEUE_STATUS': {
      return { ok: true, data: (await readQueue()).length };
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    handle(msg as BgMessage, sender)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // keep the channel open for the async answer
  });

  // Keyboard shortcut (Ctrl/Cmd+Shift+Y) -> ask the page to open a note for the current selection
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-note') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    const m: TabMessage = { type: 'OPEN_NOTE_FOR_SELECTION' };
    browser.tabs.sendMessage(tab.id, m).catch(() => {});
  });

  // Offline notes: retry every 5 minutes and when the browser starts
  browser.alarms.create('flush-queue', { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((a) => a.name === 'flush-queue' && flushQueue());
  browser.runtime.onStartup.addListener(() => flushQueue());
});
