'use client';
// Builds a Word (.docx) file from notes, right in the browser.
import { Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, TextRun, BorderStyle } from 'docx';
import type { Note } from './types';
import { hostOf, niceDate, sourceLink } from './notes';
import { APP_NAME } from './brand';

async function loadImage(url: string): Promise<{ data: ArrayBuffer; w: number; h: number; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const data = await blob.arrayBuffer();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 420 / bmp.width);
    const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg';
    return { data, w: Math.round(bmp.width * scale), h: Math.round(bmp.height * scale), type };
  } catch {
    return null;
  }
}

function groupBySource(notes: Note[]) {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const key = n.page_title || hostOf(n.source_url);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return groups;
}

export async function exportDocx(notes: Note[], heading: string) {
  const children: Paragraph[] = [
    new Paragraph({ text: heading, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `${notes.length} notes · exported ${niceDate(new Date().toISOString())} from ${APP_NAME}`, color: '7D7173', size: 20 })],
    }),
  ];

  for (const [source, group] of groupBySource(notes)) {
    children.push(new Paragraph({ text: source, heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }));
    for (const n of group) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: n.title, bold: true, size: 26 })],
          spacing: { before: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: (n.highlight_color || '#D8A3A7').replace('#', ''), space: 8 } },
        }),
      );
      for (const line of (n.body_text || '').split('\n')) {
        if (line.trim()) children.push(new Paragraph({ children: [new TextRun(line)] }));
      }
      for (const im of n.images) {
        const img = await loadImage(im.url);
        if (img) {
          children.push(
            new Paragraph({
              children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: img.w, height: img.h } })],
            }),
          );
        }
      }
      const meta: (TextRun | ExternalHyperlink)[] = [];
      if (n.tags.length) meta.push(new TextRun({ text: n.tags.map((t) => `#${t}`).join(' ') + '  ·  ', color: '3F6F94', size: 18 }));
      meta.push(new TextRun({ text: niceDate(n.created_at), color: '7D7173', size: 18 }));
      if (n.pdf_page_number) meta.push(new TextRun({ text: ` · page ${n.pdf_page_number}`, color: '7D7173', size: 18 }));
      const link = sourceLink(n);
      if (link) {
        meta.push(new TextRun({ text: '  ·  ', size: 18 }));
        meta.push(new ExternalHyperlink({ link, children: [new TextRun({ text: hostOf(n.source_url), style: 'Hyperlink', size: 18 })] }));
      }
      children.push(new Paragraph({ children: meta, spacing: { after: 120 } }));
    }
  }

  const doc = new Document({
    creator: APP_NAME,
    title: heading,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${heading.replace(/[^\w\- ]+/g, '').trim() || 'notes'}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Opens a print-friendly page; the user picks "Save as PDF". */
export function exportPdf(notes: Note[], heading: string) {
  sessionStorage.setItem('exportNotes', JSON.stringify({ ids: notes.map((n) => n.id), heading }));
  window.open('/print', '_blank');
}
