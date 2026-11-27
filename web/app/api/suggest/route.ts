// AI meaning suggestions.
// - Uses Google Gemini if GEMINI_API_KEY is set (free key: https://aistudio.google.com/apikey)
// - Otherwise, for single English words, uses the free dictionary at dictionaryapi.dev
// Called by the website (login cookie) and by the extension (Authorization: Bearer <token>).
import { NextResponse } from 'next/server';
import { createClient as createJsClient } from '@supabase/supabase-js';
import { createClient as createCookieClient } from '@/lib/supabase/server';

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 100);
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
const cache = new Map<string, string | null>();

async function supabaseFor(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return createJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
  }
  return createCookieClient();
}

async function fromGemini(text: string, context: string, title: string, language: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = [
    `Explain the meaning of the selected text in ${language}, in 1–3 short, plain sentences, as it is used in this context.`,
    'Reply with the explanation only — no intro, no quotes, no markdown.',
    `Selected text: "${text.slice(0, 500)}"`,
    context ? `Sentence it appears in: "${context.slice(0, 800)}"` : '',
    title ? `Page title: "${title.slice(0, 200)}"` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    console.error('Gemini error', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json = await res.json();
  const out: string | undefined = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  return out?.trim() || null;
}

async function fromDictionary(text: string): Promise<string | null> {
  const word = text.trim().toLowerCase();
  if (!/^[a-z][a-z'-]{1,40}$/.test(word)) return null;
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return null;
  const json = await res.json();
  const meaning = json?.[0]?.meanings?.[0];
  const def = meaning?.definitions?.[0]?.definition;
  return def ? `${word} (${meaning.partOfSpeech}): ${def}` : null;
}

export async function POST(req: Request) {
  const supabase = await supabaseFor(req);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Please log in' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; context?: string; title?: string; language?: string };
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ suggestion: null });
  const language = body.language || 'English';

  const key = `${language}|${text}|${body.context ?? ''}`;
  if (cache.has(key)) return NextResponse.json({ suggestion: cache.get(key) });

  const { data: used } = await supabase.rpc('bump_ai_usage');
  if (typeof used === 'number' && used > DAILY_LIMIT) {
    return NextResponse.json({ error: `Daily AI limit (${DAILY_LIMIT}) reached. Try again tomorrow.` }, { status: 429 });
  }

  let suggestion: string | null = null;
  try {
    suggestion = await fromGemini(text, body.context ?? '', body.title ?? '', language);
    if (!suggestion && language === 'English') suggestion = await fromDictionary(text);
  } catch (e) {
    console.error(e);
  }

  cache.set(key, suggestion);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return NextResponse.json({ suggestion });
}
