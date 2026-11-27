// Finds saved notes in the page text again and paints a highlight on them.
// Works on normal pages (root = document.body) and in our PDF viewer (root = the pages container).
import type { TextAnchor } from './types';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TEMPLATE', 'IFRAME']);
export const HL_TAG = 'annot-hl';
const UI_TAG = 'ANNOT-STICKY-UI';

interface TextIndex {
  nodes: Text[];
  starts: number[];
  text: string;
}

function acceptNode(node: Node): number {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName) || el.tagName === UI_TAG) return NodeFilter.FILTER_REJECT;
    el = el.parentElement;
  }
  return NodeFilter.FILTER_ACCEPT;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'FIGCAPTION', 'TR', 'HEADER', 'FOOTER']);

/** The block (paragraph, list item, PDF line…) a text node belongs to. */
function blockOf(node: Node): Element | null {
  let el = node.parentElement;
  while (el) {
    if (BLOCK_TAGS.has(el.tagName) || el.parentElement?.classList.contains('textLayer')) return el;
    el = el.parentElement;
  }
  return null;
}

export function buildIndex(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  let lastBlock: Element | null = null;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    // add a line break between paragraphs / PDF lines so words don't run together
    const block = blockOf(t);
    if (lastBlock && block !== lastBlock && text && !/\s$/.test(text)) text += '\n';
    lastBlock = block;
    nodes.push(t);
    starts.push(text.length);
    text += t.data;
  }
  return { nodes, starts, text };
}

/** Character offset of a (container, offset) DOM position inside the index text. */
export function offsetOf(idx: TextIndex, container: Node, offset: number): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const i = idx.nodes.indexOf(container as Text);
    if (i >= 0) return idx.starts[i] + offset;
  }
  // element position: find first text node at/after that point
  const probe = document.createRange();
  for (let i = 0; i < idx.nodes.length; i++) {
    probe.selectNode(idx.nodes[i]);
    if (probe.comparePoint(container, offset) <= 0) return idx.starts[i];
  }
  return idx.text.length;
}

/** Build the anchor (exact text + some text before/after) for a selection range. */
export function anchorFromRange(root: Node, range: Range): { anchor: TextAnchor; before: string; after: string } {
  const idx = buildIndex(root);
  const start = offsetOf(idx, range.startContainer, range.startOffset);
  const end = Math.max(start, offsetOf(idx, range.endContainer, range.endOffset));
  const exact = idx.text.slice(start, end) || range.toString();
  return {
    anchor: { exact, prefix: idx.text.slice(Math.max(0, start - 64), start), suffix: idx.text.slice(end, end + 64), start, end },
    before: idx.text.slice(Math.max(0, start - 400), start),
    after: idx.text.slice(end, end + 400),
  };
}

function commonSuffixLen(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}
function commonPrefixLen(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Find the best place where the anchor's text appears. Returns [start, end] or null. */
export function locate(idx: TextIndex, a: TextAnchor): [number, number] | null {
  const exact = a.exact;
  if (!exact) return null;
  const hits: number[] = [];
  let from = 0;
  while (hits.length < 2000) {
    const i = idx.text.indexOf(exact, from);
    if (i < 0) break;
    hits.push(i);
    from = i + 1;
  }
  if (hits.length === 0) {
    // try again ignoring whitespace differences
    const norm = exact.replace(/\s+/g, ' ').trim();
    const re = new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'g');
    let m: RegExpExecArray | null;
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    while ((m = re.exec(idx.text)) && m[0].length > 0) {
      const s = m.index;
      const e = s + m[0].length;
      const score = commonSuffixLen(idx.text.slice(Math.max(0, s - 64), s), a.prefix) + commonPrefixLen(idx.text.slice(e, e + 64), a.suffix);
      if (score > bestScore) [bestScore, best] = [score, [s, e]];
    }
    return best;
  }
  if (hits.length === 1) return [hits[0], hits[0] + exact.length];
  let best = hits[0];
  let bestScore = -Infinity;
  const total = Math.max(1, idx.text.length);
  for (const s of hits) {
    const e = s + exact.length;
    const score =
      commonSuffixLen(idx.text.slice(Math.max(0, s - 64), s), a.prefix) +
      commonPrefixLen(idx.text.slice(e, e + 64), a.suffix) -
      (Math.abs(s - a.start) / total) * 8;
    if (score > bestScore) [bestScore, best] = [score, s];
  }
  return [best, best + exact.length];
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (Number.isNaN(n)) return `rgba(255,229,143,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Wrap text [start, end) in highlight elements. */
function wrap(idx: TextIndex, start: number, end: number, noteId: string, color: string): HTMLElement[] {
  const made: HTMLElement[] = [];
  for (let i = 0; i < idx.nodes.length; i++) {
    const nodeStart = idx.starts[i];
    const node = idx.nodes[i];
    const nodeEnd = nodeStart + node.data.length;
    if (nodeEnd <= start || nodeStart >= end) continue;
    if (!node.data.trim()) continue;
    let target = node;
    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(node.data.length, end - nodeStart);
    if (localStart > 0) target = target.splitText(localStart);
    if (localEnd - localStart < target.data.length) target.splitText(localEnd - localStart);
    const hl = document.createElement(HL_TAG);
    hl.dataset.note = noteId;
    hl.style.cssText = `background-color:${hexToRgba(color, 0.35)};border-bottom:2px solid ${hexToRgba(color, 1)};cursor:pointer;border-radius:2px;color:inherit;`;
    target.parentNode!.insertBefore(hl, target);
    hl.appendChild(target);
    made.push(hl);
  }
  return made;
}

export interface Highlightable {
  id: string;
  anchor: TextAnchor | null;
  highlight_color?: string | null;
}

/** Highlight every note that isn't highlighted yet. Returns the ids that could not be found. */
export function applyHighlights(root: Node, notes: Highlightable[]): string[] {
  const orphans: string[] = [];
  for (const n of notes) {
    if (!n.anchor?.exact) continue;
    if ((root as Element | Document).querySelector?.(`${HL_TAG}[data-note="${CSS.escape(n.id)}"]`)) continue;
    const idx = buildIndex(root);
    const pos = locate(idx, n.anchor);
    if (!pos) {
      orphans.push(n.id);
      continue;
    }
    wrap(idx, pos[0], pos[1], n.id, n.highlight_color || '#D8A3A7');
  }
  return orphans;
}

export function removeHighlight(noteId: string) {
  document.querySelectorAll(`${HL_TAG}[data-note="${CSS.escape(noteId)}"]`).forEach((el) => {
    const parent = el.parentNode!;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

export function scrollToHighlight(noteId: string): boolean {
  const el = document.querySelector<HTMLElement>(`${HL_TAG}[data-note="${CSS.escape(noteId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.animate([{ outline: '3px solid #D8A3A7' }, { outline: '3px solid transparent' }], { duration: 1600 });
  return true;
}
