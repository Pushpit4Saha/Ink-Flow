import type { TextAnchor } from './types';
import { anchorFromRange } from './highlighter';

export interface CapturedSelection {
  text: string;
  rect: DOMRect;
  anchor: TextAnchor;
  context: string;
  pageNumber: number | null; // PDF page, when inside our PDF viewer
}

function isEditable(node: Node | null): boolean {
  let el: Node | null = node;
  while (el) {
    if (el instanceof HTMLElement) {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    }
    el = el.parentNode;
  }
  return false;
}

/** Find the sentence around the selection, for context on the dashboard and for AI. */
function surroundingSentence(before: string, text: string, after: string): string {
  const b = before.slice(-300);
  const a = after.slice(0, 300);
  const startIdx = Math.max(b.lastIndexOf('. '), b.lastIndexOf('? '), b.lastIndexOf('! '), b.lastIndexOf('\n'));
  const head = startIdx >= 0 ? b.slice(startIdx + 1) : b;
  const m = a.search(/[.?!](\s|$)|\n/);
  const tail = m >= 0 ? a.slice(0, m + 1) : a;
  return (head + text + tail).replace(/\s+/g, ' ').trim();
}

/** Read the current selection inside `root`. Returns null if nothing useful is selected. */
export function captureSelection(root: Node = document.body): CapturedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const text = sel.toString().trim();
  if (!text || text.length > 2000) return null;

  const range = sel.getRangeAt(0);
  if (isEditable(range.commonAncestorContainer)) return null;
  if (!root.contains(range.commonAncestorContainer)) return null;

  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;

  const { anchor, before, after } = anchorFromRange(root, range);
  const startEl =
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const pageAttr = startEl?.closest('[data-page-number]')?.getAttribute('data-page-number');

  return {
    text,
    rect,
    anchor,
    context: surroundingSentence(before, anchor.exact, after),
    pageNumber: pageAttr ? Number(pageAttr) : null,
  };
}

export function getFaviconUrl(): string | null {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  );
  if (link?.href) return link.href;
  try {
    return new URL('/favicon.ico', location.origin).toString();
  } catch {
    return null;
  }
}

/** Shrink a photo before upload (max 1600px, JPEG) so notes stay light. */
export function fileToDataUrl(file: Blob, maxSide = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
