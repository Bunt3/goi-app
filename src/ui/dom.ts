import { nativeSave } from '../native';
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Minimal hyperscript: h('button', { class: 'primary', onclick }, 'Save'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (value === false && !(key in el)) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key === 'class') {
        el.className = value === false ? '' : String(value);
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key in el && key !== 'list') {
        (el as unknown as Props)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, action?: { label: string; run: () => void }, ms = 3500): void {
  const host = document.getElementById('toast');
  if (!host) return;
  clear(host);
  append(host, [
    h('span', null, message),
    action
      ? h(
          'button',
          {
            class: 'link',
            onclick: () => {
              host.classList.remove('show');
              action.run();
            },
          },
          action.label,
        )
      : null,
  ]);
  host.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), ms);
}

/**
 * Save a text file for the owner: a browser download on the website, a file
 * in Downloads in the APK. Resolves to where it went; rejects if the APK
 * could not save it (a browser download can't report failure).
 */
export async function download(filename: string, text: string, mime: string): Promise<string> {
  if (__NATIVE__) return nativeSave(filename, text, mime);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'Downloads';
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
