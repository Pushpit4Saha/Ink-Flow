'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';
import { BODY_FONTS, COLORS, TITLE_FONTS, bodyFontCss, titleFontCss } from '@/lib/brand';
import type { Profile } from '@/lib/types';

const LANGUAGES = ['English', 'Bangla', 'Hindi', 'Arabic', 'Spanish', 'French', 'Chinese'];

export default function SettingsForm({ email, profile }: { email: string; profile: Profile | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [ai, setAi] = useState(profile?.ai_enabled ?? true);
  const [lang, setLang] = useState(profile?.ai_language ?? 'English');
  const [color, setColor] = useState(profile?.highlight_color ?? COLORS[0].hex);
  const [titleFont, setTitleFont] = useState(profile?.title_font ?? 'Lobster');
  const [bodyFont, setBodyFont] = useState(profile?.body_font ?? 'Inter');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: auth.user!.id, display_name: name, ai_enabled: ai, ai_language: lang, highlight_color: color, title_font: titleFont, body_font: bodyFont });
    setBusy(false);
    setMsg(error ? error.message : 'Saved ✓');
    if (!error) router.refresh();
  };

  const deleteAccount = async () => {
    if (prompt('This deletes your account, all notes, photos and PDFs forever. Type DELETE to confirm.') !== 'DELETE') return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user!.id;
    // remove files first (photos and PDFs), then the account
    const [{ data: imgs }, { data: pdfs }] = await Promise.all([
      supabase.from('note_images').select('storage_path').eq('user_id', uid),
      supabase.from('pdf_files').select('storage_path').eq('user_id', uid),
    ]);
    if (imgs?.length) await supabase.storage.from('note-images').remove(imgs.map((i) => i.storage_path));
    if (pdfs?.length) await supabase.storage.from('pdfs').remove(pdfs.map((p) => p.storage_path));
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }
    await supabase.auth.signOut();
    router.push('/');
  };

  const box = 'rounded-xl border border-line bg-white p-5';
  return (
    <AppShell email={email}>
      <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
        <h1 className="text-xl font-bold md:text-2xl">Settings</h1>

        <section className={box}>
          <h2 className="mb-3 font-semibold">Profile</h2>
          <label className="block text-sm">
            Display name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2" />
          </label>
          <p className="mt-2 text-sm text-muted">Email: {email}</p>
        </section>

        <section className={box}>
          <h2 className="mb-3 font-semibold">✨ AI suggestions</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ai} onChange={() => setAi(!ai)} className="accent-brand" />
            Suggest meanings automatically when I select text
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            Explain in
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-line px-2 py-1">
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </section>

        <section className={box}>
          <h2 className="mb-3 font-semibold">Default highlight colour</h2>
          <div className="flex gap-3">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${color === c.hex ? 'border-ink' : 'border-line'}`}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </section>

        <section className={box}>
          <h2 className="mb-3 font-semibold">Fonts</h2>
          <p className="mb-2 text-sm text-muted">Title font (for note titles)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TITLE_FONTS.map((f) => (
              <button
                key={f}
                onClick={() => setTitleFont(f)}
                className={`rounded-xl border p-3 text-left ${titleFont === f ? 'border-brand bg-paper ring-1 ring-brand' : 'border-line'}`}
              >
                <span className="block text-2xl leading-tight" style={{ fontFamily: titleFontCss(f), fontWeight: f === 'Inter' ? 700 : 400 }}>
                  Ink&Flow
                </span>
                <span className="text-xs text-muted">{f}</span>
              </button>
            ))}
          </div>
          <p className="mb-2 mt-5 text-sm text-muted">Text font (for everything else)</p>
          <div className="grid grid-cols-2 gap-2">
            {BODY_FONTS.map((f) => (
              <button
                key={f}
                onClick={() => setBodyFont(f)}
                className={`rounded-xl border p-3 text-left ${bodyFont === f ? 'border-brand bg-paper ring-1 ring-brand' : 'border-line'}`}
              >
                <span className="block" style={{ fontFamily: bodyFontCss(f) }}>
                  Hey! Welcome to Ink&Flow
                </span>
                <span className="text-xs text-muted">{f}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Save settings
          </button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>

        <section className={`${box} border-red-200`}>
          <h2 className="mb-2 font-semibold text-red-800">Delete account</h2>
          <p className="mb-3 text-sm text-muted">Permanently delete your account and everything in it.</p>
          <button onClick={deleteAccount} disabled={busy} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-800 hover:bg-red-50">
            Delete my account
          </button>
        </section>

        <p className="text-center text-xs text-muted">
          <Link href="/privacy" className="underline">Privacy policy</Link> · <Link href="/terms" className="underline">Terms</Link>
        </p>
      </main>
    </AppShell>
  );
}
