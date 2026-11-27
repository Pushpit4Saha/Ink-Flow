export const APP_NAME = 'Ink&Flow';
export const BRAND = '#D8A3A7';

// Brand palette — pink is the main colour
export const COLORS = [
  { hex: BRAND, name: 'Pink' },
  { hex: '#77C599', name: 'Green' },
  { hex: '#77A3C5', name: 'Blue' },
  { hex: '#F2C94C', name: 'Yellow' },
];

/** Light "paper" tint for a note of a given colour. */
/** Solid colour of a note card. Old pink notes pick up the current brand pink. */
export function noteBlockColor(hex?: string | null): string {
  if (!hex || hex.toLowerCase() === '#c5777c') return BRAND;
  return hex;
}

export function paperTint(hex: string | null | undefined, amount = 0.84): string {
  const h = (hex || BRAND).replace('#', '');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return '#FBEEEF';
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

// Fonts: Inter or Times New Roman for text; a cute font for titles
export const TITLE_FONTS = ['Lobster', 'Pacifico', 'Grand Hotel', 'Fredericka the Great', 'Inter'] as const;
export const BODY_FONTS = ['Inter', 'Times New Roman'] as const;

export function titleFontCss(name?: string | null) {
  if (!name || name === 'Inter') return "'Inter', ui-sans-serif, system-ui, sans-serif";
  return `'${name}', cursive`;
}
export function bodyFontCss(name?: string | null) {
  if (name === 'Times New Roman') return "'Times New Roman', Times, 'Liberation Serif', 'Noto Serif Bengali', serif";
  return "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif";
}
/** CSS variables set on <body> */
export function fontVars(title: string | null = 'Lobster', body: string | null = 'Inter'): Record<string, string> {
  return {
    '--font-title': titleFontCss(title),
    '--font-title-weight': !title || title === 'Inter' ? '700' : '400',
    '--font-body': bodyFontCss(body),
  };
}
