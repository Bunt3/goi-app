/**
 * Interface language. English is what the code writes; Japanese is applied
 * on top by translating the rendered text (text nodes and a few attributes)
 * as it appears, using src/i18n/ja.ts. Anything marked data-content (the
 * owner's cards, dictionary glosses, user-typed text) is left alone, and a
 * string without a translation simply stays English.
 */
import { translate } from '../i18n/ja';

export type UiLang = 'en' | 'ja';

let lang: UiLang = 'en';
let observer: MutationObserver | null = null;
/** English originals of what was translated, so switching back restores them. */
const originalText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Record<string, string>>();
/** What this module last wrote into each text node, so its own writes aren't processed again. */
const written = new WeakMap<Text, string>();
const ATTRS = ['placeholder', 'aria-label', 'title'];
/** Collected English strings with no translation (for development; see e2e). */
export const missing = new Set<string>();
(globalThis as unknown as { __goiMissing?: Set<string> }).__goiMissing = missing;

function skip(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return true;
  if (el.closest('[data-content], script, style, textarea')) return true;
  return false;
}

function translateText(node: Text): void {
  const raw = node.data;
  if (written.get(node) === raw) return;
  const trimmed = raw.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed) || skip(node)) return;
  const ja = translate(trimmed);
  if (ja === null) {
    missing.add(trimmed);
    return;
  }
  const lead = raw.slice(0, raw.indexOf(trimmed));
  const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
  // Japanese runs on without the spaces English needed around inline words.
  const next = (lead.trim() === '' ? '' : lead) + ja + (tail.trim() === '' ? '' : tail);
  // Writing even an unchanged value fires the observer again, so only write real changes.
  if (next === raw) return;
  if (!originalText.has(node)) originalText.set(node, raw);
  written.set(node, next);
  node.data = next;
}

function translateAttrs(el: Element): void {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !/[A-Za-z]/.test(v)) continue;
    const ja = translate(v.trim());
    if (ja === null) {
      missing.add(v.trim());
      continue;
    }
    if (ja === v) continue;
    const saved = originalAttr.get(el) ?? {};
    if (!(a in saved)) saved[a] = v;
    originalAttr.set(el, saved);
    el.setAttribute(a, ja);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateAttrs(root as Element);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
    else translateAttrs(n as Element);
  }
}

function restore(root: Node): void {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const o = originalText.get(n as Text);
      if (o !== undefined) (n as Text).data = o;
    } else {
      const o = originalAttr.get(n as Element);
      if (o) for (const [a, v] of Object.entries(o)) (n as Element).setAttribute(a, v);
    }
  }
}

export function uiLang(): UiLang {
  return lang;
}

/** Switch the interface language. Japanese keeps translating whatever is rendered from now on. */
export function setUiLang(next: UiLang): void {
  lang = next;
  observer?.disconnect();
  observer = null;
  if (next === 'en') {
    restore(document.body);
    return;
  }
  walk(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target as Text);
      else if (r.type === 'attributes') translateAttrs(r.target as Element);
      else for (const n of r.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
