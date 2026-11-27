import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './viewer.css';
import { createElement } from 'react';
import ReactDOM from 'react-dom/client';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import AnnotApp from '../../components/AnnotApp';
import annotCss from '../../components/annot.css?inline';
import logoUrl from '../../assets/logo.png?inline';
import { APP_NAME } from '../../lib/config';
import { injectFontFaces } from '../../lib/fonts';
import { openPdf, pdfTitle, renderPdf } from '../../lib/pdfRender';
import type { PageSource } from '../../lib/source';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const app = document.getElementById('app')!;
const fileUrl = new URLSearchParams(location.search).get('file');

// tiny helper to build DOM elements
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function fileInput(onFile: (f: File) => void) {
  const input = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  input.onchange = () => input.files?.[0] && onFile(input.files[0]);
  return input;
}

function showWelcome(error?: string) {
  injectFontFaces();
  document.title = `${APP_NAME} — PDF viewer`;
  app.innerHTML = '';
  const input = fileInput(openLocal);
  const pick = el('button', { className: 'primary', textContent: 'Choose a PDF' });
  pick.style.cssText = 'font:inherit;padding:10px 18px;border-radius:9px;cursor:pointer';
  pick.onclick = () => input.click();
  const drop = el('div', { className: 'drop' }, el('p', { textContent: 'Drop a PDF here' }), pick, input);
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add('over');
  };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) openLocal(f);
  };
  const logo = el('img', { src: logoUrl, alt: '' });
  logo.style.cssText = 'width:72px;height:72px;border-radius:50%';
  app.append(
    el(
      'div',
      { className: 'welcome' },
      logo,
      el('h1', { textContent: `${APP_NAME} PDF viewer` }),
      el('p', { className: 'muted', textContent: 'Open any PDF from your computer, select text, and add sticky notes. Your notes come back every time you open the same PDF.' }),
      drop,
    ),
  );
  if (error) app.append(el('div', { className: 'error', textContent: error }));
}

async function openLocal(f: File) {
  const data = await f.arrayBuffer();
  try {
    const pdf = await openPdf({ data });
    await showPdf(pdf, { url: `local-pdf://${f.name}`, name: f.name, type: 'pdf_local' });
  } catch (e) {
    showWelcome(`Could not open this PDF: ${e instanceof Error ? e.message : e}`);
  }
}

async function showPdf(pdf: PDFDocumentProxy, src: { url: string; name: string; type: 'pdf_local' | 'pdf_online' }) {
  const title = await pdfTitle(pdf, src.name);
  document.title = title;
  const fingerprint = pdf.fingerprints[0] ?? null;
  let scale = Math.min(1.6, Math.max(0.6, (window.innerWidth - 40) / 612));

  app.innerHTML = '';
  const pages = el('div', { id: 'pages' });
  const zoomLabel = el('span', { className: 'muted' });
  const input = fileInput(openLocal);
  const openBtn = el('button', { textContent: 'Open another PDF' });
  openBtn.onclick = () => input.click();
  const minus = el('button', { textContent: '−', title: 'Zoom out' });
  const plus = el('button', { textContent: '+', title: 'Zoom in' });
  app.append(
    el('div', { className: 'bar' }, el('img', { src: logoUrl, alt: '' }), el('span', { className: 'title', textContent: title }), el('span', { className: 'muted', textContent: `${pdf.numPages} pages` }), minus, zoomLabel, plus, openBtn, input),
    pages,
  );

  const refresh = () => window.dispatchEvent(new Event('annot:refresh'));
  let stop = await renderPdf(pdf, pages, scale, refresh);
  const rezoom = async (f: number) => {
    scale = Math.min(3, Math.max(0.4, scale * f));
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    stop();
    stop = await renderPdf(pdf, pages, scale, refresh);
  };
  zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  minus.onclick = () => rezoom(1 / 1.2);
  plus.onclick = () => rezoom(1.2);

  // mount the same sticky-note app used on web pages, isolated in a Shadow DOM
  document.querySelector('annot-sticky-ui')?.remove();
  const host = document.createElement('annot-sticky-ui');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('style', { textContent: annotCss }));
  const mount = el('div');
  shadow.append(mount);
  const source: PageSource = {
    kind: 'pdf',
    url: () => src.url,
    title: () => title,
    favicon: () => null,
    sourceType: () => src.type,
    fingerprint: () => fingerprint,
    root: () => pages,
  };
  ReactDOM.createRoot(mount).render(createElement(AnnotApp, { host, source }));
}

if (fileUrl) {
  app.append(el('p', { className: 'muted', textContent: 'Loading PDF…' }));
  openPdf({ url: fileUrl })
    .then((pdf) => {
      const name = decodeURIComponent(fileUrl.split('/').pop()?.split('?')[0] || 'document.pdf');
      return showPdf(pdf, { url: fileUrl, name, type: fileUrl.startsWith('file:') ? 'pdf_local' : 'pdf_online' });
    })
    .catch((e) => {
      const hint = fileUrl.startsWith('file:')
        ? ' To open files from your computer, turn on "Allow access to file URLs" for this extension (chrome://extensions → Details), or use the button below.'
        : '';
      showWelcome(`Could not load ${fileUrl}: ${e instanceof Error ? e.message : e}.${hint}`);
    });
} else {
  showWelcome();
}
