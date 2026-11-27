// Renders a PDF into a container: one canvas + selectable text layer per page.
// Pages are drawn lazily when they come near the screen (fast for big PDFs).
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export async function openPdf(src: { url: string } | { data: ArrayBuffer }): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument('url' in src ? { url: src.url } : { data: src.data }).promise;
}

export async function pdfTitle(pdf: PDFDocumentProxy, fallback: string): Promise<string> {
  try {
    const meta = await pdf.getMetadata();
    const t = (meta.info as { Title?: string } | undefined)?.Title?.trim();
    return t && !/^untitled$/i.test(t) ? t : fallback;
  } catch {
    return fallback;
  }
}

/** Draw all pages into `container` at `scale`. Calls onTextReady() whenever a page's text layer is ready. */
export async function renderPdf(
  pdf: PDFDocumentProxy,
  container: HTMLElement,
  scale: number,
  onTextReady: () => void,
): Promise<() => void> {
  container.innerHTML = '';
  const rendered = new Set<number>();
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = Number((e.target as HTMLElement).dataset.pageNumber);
        if (rendered.has(n)) continue;
        rendered.add(n);
        drawPage(n, e.target as HTMLElement).catch(console.error);
      }
    },
    { rootMargin: '1200px 0px' },
  );

  async function drawPage(n: number, div: HTMLElement) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    div.appendChild(canvas);
    await page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;

    const textDiv = document.createElement('div');
    textDiv.className = 'textLayer';
    div.appendChild(textDiv);
    const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
    await tl.render();
    onTextReady();
  }

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale });
    const div = document.createElement('div');
    div.className = 'pdf-page';
    div.dataset.pageNumber = String(n);
    div.style.width = `${vp.width}px`;
    div.style.height = `${vp.height}px`;
    div.style.setProperty('--scale-factor', String(scale));
    div.style.setProperty('--user-unit', '1');
    div.style.setProperty('--total-scale-factor', String(scale));
    container.appendChild(div);
    obs.observe(div);
  }
  return () => obs.disconnect();
}
