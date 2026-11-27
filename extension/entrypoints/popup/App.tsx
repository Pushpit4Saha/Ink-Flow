import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { sendToBg } from '../../lib/messaging';
import { APP_NAME, isConfigured } from '../../lib/config';
import { COLORS, type Meta, type Settings, type UserInfo } from '../../lib/types';
import logoUrl from '../../assets/logo.png?inline';
import { BODY_FONTS, TITLE_FONTS, injectFontFaces, titleFontCss, bodyFontCss } from '../../lib/fonts';

injectFontFaces();

const LANGUAGES = ['English', 'Bangla', 'Hindi', 'Arabic', 'Spanish', 'French', 'Chinese'];

export default function App() {
  const [user, setUser] = useState<UserInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [fabOn, setFabOn] = useState(true);
  const [autoPdf, setAutoPdf] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    sendToBg<UserInfo | null>({ type: 'GET_USER' }).then((r) => setUser(r.ok ? r.data : null));
    sendToBg<number>({ type: 'QUEUE_STATUS' }).then((r) => r.ok && setQueued(r.data));
    browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      try {
        const h = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : null;
        setHost(h);
        const r = await browser.storage.local.get(['disabledSites', 'autoPdf']);
        const list = (r.disabledSites as string[] | undefined) ?? [];
        setFabOn(!h || !list.includes(h));
        setAutoPdf(Boolean(r.autoPdf));
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    if (user) sendToBg<Meta>({ type: 'GET_META' }).then((r) => r.ok && setSettings(r.data.settings));
  }, [user]);

  const updateSettings = (s: Partial<Settings>) => {
    setSettings((old) => (old ? { ...old, ...s } : old));
    sendToBg({ type: 'SET_SETTINGS', settings: s });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === 'login') {
      const r = await sendToBg<UserInfo>({ type: 'SIGN_IN', email, password });
      if (r.ok) setUser(r.data);
      else setMsg(r.error);
    } else {
      const r = await sendToBg<{ needsConfirm: boolean }>({ type: 'SIGN_UP', email, password });
      if (!r.ok) setMsg(r.error);
      else if (r.data.needsConfirm) {
        setMsg('Check your email and click the confirmation link, then log in here.');
        setMode('login');
      } else {
        const u = await sendToBg<UserInfo | null>({ type: 'GET_USER' });
        setUser(u.ok ? u.data : null);
      }
    }
    setBusy(false);
  };

  const toggleFab = async () => {
    if (!host) return;
    const r = await browser.storage.local.get('disabledSites');
    const list = new Set((r.disabledSites as string[] | undefined) ?? []);
    if (fabOn) list.add(host);
    else list.delete(host);
    await browser.storage.local.set({ disabledSites: [...list] });
    setFabOn(!fabOn);
  };

  return (
    <div className="wrap">
      <header>
        <img className="logo" src={logoUrl} alt="" />
        <div>
          <h1 className="name" style={{ fontSize: 22 }}>{APP_NAME}</h1>
          <p className="sub">Sticky notes for anything you read</p>
        </div>
      </header>

      {!isConfigured && (
        <div className="warn">
          Not configured yet. Put your Supabase URL and key in <code>extension/.env</code> and rebuild.
        </div>
      )}

      {user === undefined && <p className="muted">Loading…</p>}

      {user && (
        <>
          <p className="small">
            Logged in as <strong>{user.email}</strong>
          </p>
          <button className="primary" onClick={() => sendToBg({ type: 'OPEN_DASHBOARD' }).then(() => window.close())}>
            Open my notes
          </button>
          <button className="secondary" onClick={() => sendToBg({ type: 'OPEN_PDF_VIEWER' }).then(() => window.close())}>
            📄 Open a PDF from my computer
          </button>
          {queued > 0 && <p className="small green">{queued} note(s) waiting to sync — they’ll upload when you’re online.</p>}

          <section>
            <h2>This site</h2>
            {host ? (
              <label className="toggle">
                <input type="checkbox" checked={fabOn} onChange={toggleFab} />
                Show round button on <strong>{host}</strong>
              </label>
            ) : (
              <p className="muted small">Not available on this page.</p>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoPdf}
                onChange={() => {
                  browser.storage.local.set({ autoPdf: !autoPdf });
                  setAutoPdf(!autoPdf);
                }}
              />
              Always open PDFs in <span className="name">{APP_NAME}</span>
            </label>
          </section>

          {settings && (
            <section>
              <h2>Settings</h2>
              <label className="toggle">
                <input type="checkbox" checked={settings.ai_enabled} onChange={() => updateSettings({ ai_enabled: !settings.ai_enabled })} />
                ✨ AI meaning suggestions
              </label>
              <label className="row">
                Explain in
                <select value={settings.ai_language} onChange={(e) => updateSettings({ ai_language: e.target.value })}>
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="row">
                Title font
                <select
                  value={settings.title_font}
                  style={{ fontFamily: titleFontCss(settings.title_font), fontSize: 15 }}
                  onChange={(e) => updateSettings({ title_font: e.target.value })}
                >
                  {TITLE_FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: titleFontCss(f) }}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row">
                Text font
                <select
                  value={settings.body_font}
                  style={{ fontFamily: bodyFontCss(settings.body_font) }}
                  onChange={(e) => updateSettings({ body_font: e.target.value })}
                >
                  {BODY_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                Default colour
                <div className="dots">
                  {COLORS.map((c) => (
                    <button
                      key={c.hex}
                      title={c.name}
                      className={settings.highlight_color === c.hex ? 'dot on' : 'dot'}
                      style={{ background: c.hex }}
                      onClick={() => updateSettings({ highlight_color: c.hex })}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          <p className="muted small">Shortcut: select text, then press Ctrl+Shift+Y (Mac: ⌘+Shift+Y).</p>
          <button
            className="link"
            onClick={async () => {
              await sendToBg({ type: 'SIGN_OUT' });
              setUser(null);
            }}
          >
            Log out
          </button>
        </>
      )}

      {user === null && (
        <form onSubmit={submit}>
          <div className="tabs">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
              Log in
            </button>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
              Sign up
            </button>
          </div>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <p className="muted small">Use the same email and password as on the website.</p>
        </form>
      )}

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
