/**
 * Text shared into the app from another app (Web Share Target). Pure.
 * Android apps fill title, text and url inconsistently: text is usually the
 * selection, sometimes followed by a link; a shared web page may arrive as a
 * url only.
 */
export interface Shared {
  /** Text to pick words from ('' if only a link was shared). */
  text: string;
  /** Where it came from, for the cards' Source field. */
  source: string;
  /** The link, if one was shared. */
  url: string;
}

const URL_RE = /https?:\/\/\S+/g;

export function readShare(params: URLSearchParams): Shared | null {
  const title = (params.get('title') ?? '').trim();
  const rawText = (params.get('text') ?? '').trim();
  let url = (params.get('url') ?? '').trim();
  if (!title && !rawText && !url) return null;
  // A link inside the text is the source, not something to study.
  const links = rawText.match(URL_RE) ?? [];
  if (!url && links.length) url = links[0]!;
  const text = rawText.replace(URL_RE, '').trim();
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    host = '';
  }
  // With no text, a title is often the page headline: still worth picking from.
  const body = text || (/[぀-ヿ㐀-鿿]/.test(title) ? title : '');
  const source = [text && title ? title : '', host].filter(Boolean).join(' · ') || 'shared';
  return { text: body, source, url };
}

/**
 * Text Android handed to the APK (text-selection menu or share sheet). Same
 * rules as a Web Share Target request; when nothing else names the source,
 * the sending app does ("LINE", "Chrome").
 */
export function readAppShare(share: { text: string; subject: string; app: string }): Shared | null {
  const r = readShare(new URLSearchParams({ title: share.subject, text: share.text }));
  if (!r) return null;
  const app = share.app.trim();
  if (app && r.source === 'shared') r.source = app;
  return r;
}
