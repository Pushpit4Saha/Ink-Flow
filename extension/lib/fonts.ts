// Fonts: Inter or Times New Roman for text; a cute font of your choice for titles.
import { browser } from 'wxt/browser';

export const TITLE_FONTS = ['Lobster', 'Pacifico', 'Grand Hotel', 'Fredericka the Great', 'Inter'] as const;
export const BODY_FONTS = ['Inter', 'Times New Roman'] as const;

const FILES: [family: string, file: string, weight: number][] = [
  ['Inter', 'inter-400.woff2', 400],
  ['Inter', 'inter-600.woff2', 600],
  ['Inter', 'inter-700.woff2', 700],
  ['Lobster', 'lobster.woff2', 400],
  ['Pacifico', 'pacifico.woff2', 400],
  ['Grand Hotel', 'grand-hotel.woff2', 400],
  ['Fredericka the Great', 'fredericka.woff2', 400],
];

/** Adds @font-face rules to the page (fonts can't be declared inside a Shadow DOM). Names are prefixed so they never clash with the page. */
export function injectFontFaces() {
  if (document.getElementById('annot-fonts')) return;
  const css = FILES.map(
    ([family, file, weight]) =>
      `@font-face{font-family:'Annot ${family}';src:url('${browser.runtime.getURL(`/fonts/${file}` as '/fonts/inter-400.woff2')}') format('woff2');font-weight:${weight};font-style:normal;font-display:swap;}`,
  ).join('\n');
  const style = document.createElement('style');
  style.id = 'annot-fonts';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

export function titleFontCss(name: string | undefined) {
  if (!name || name === 'Inter') return "'Annot Inter', ui-sans-serif, system-ui, sans-serif";
  return `'Annot ${name}', cursive`;
}
export function bodyFontCss(name: string | undefined) {
  if (name === 'Times New Roman') return "'Times New Roman', Times, 'Liberation Serif', 'Noto Serif Bengali', serif";
  return "'Annot Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif";
}

/** CSS variables to put on our root element */
export function fontVars(title?: string, body?: string): Record<string, string> {
  return {
    '--annot-title-font': titleFontCss(title),
    '--annot-title-weight': !title || title === 'Inter' ? '700' : '400',
    '--annot-body-font': bodyFontCss(body),
  };
}
