import type { SourceType } from './types';
import { getFaviconUrl } from './selection';

/** Describes where notes come from: a normal web page, or a PDF in our viewer. */
export interface PageSource {
  kind: 'page' | 'pdf';
  url: () => string;
  title: () => string;
  favicon: () => string | null;
  sourceType: () => SourceType;
  fingerprint: () => string | null;
  root: () => Node;
}

export const webPageSource: PageSource = {
  kind: 'page',
  url: () => location.href,
  title: () => document.title || location.hostname,
  favicon: getFaviconUrl,
  sourceType: () => 'web',
  fingerprint: () => null,
  root: () => document.body,
};
