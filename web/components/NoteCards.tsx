// Read-only list of notes (used by the print/PDF export and public share pages)
import { noteBlockColor } from '@/lib/brand';
import { hostOf, niceDate, sourceLink } from '@/lib/notes';
import type { Note } from '@/lib/types';

export function groupBySource(notes: Note[]) {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const key = n.page_title || hostOf(n.source_url);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.entries()];
}

export default function NoteCards({ notes, showLinks = true }: { notes: Note[]; showLinks?: boolean }) {
  return (
    <div className="space-y-8">
      {groupBySource(notes).map(([source, group]) => (
        <section key={source} className="break-inside-avoid-page">
          <h2 className="mb-3 border-b border-line pb-1 text-lg font-bold">{source}</h2>
          <div className="space-y-3">
            {group.map((n) => {
              const link = sourceLink(n);
              return (
                <article
                  key={n.id}
                  className="note-block break-inside-avoid rounded-xl border-l-4 p-4"
                  style={{ background: noteBlockColor(n.highlight_color), borderColor: noteBlockColor(n.highlight_color), printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                >
                  <h3 className="font-title text-lg">{n.title}</h3>
                  {n.body_text && <p className="mt-1 whitespace-pre-wrap text-sm">{n.body_text}</p>}
                  {n.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {n.images.map((im) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={im.id} src={im.url} alt="" className="max-h-56 max-w-full rounded-lg" />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {n.tags.map((t) => `#${t}`).join(' ')}
                    {n.tags.length ? ' · ' : ''}
                    {niceDate(n.created_at)}
                    {n.pdf_page_number ? ` · page ${n.pdf_page_number}` : ''}
                    {showLinks && link && (
                      <>
                        {' · '}
                        <a href={link} className="underline" target="_blank" rel="noreferrer">
                          {hostOf(n.source_url)}
                        </a>
                      </>
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
