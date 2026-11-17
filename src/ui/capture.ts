import { disposeOcr, recognize } from '../ocr';
import { cleanCapturedText } from '../textpick';
import type { View } from './app';
import { h, toast } from './dom';
import type { Shared } from '../share';
import { deckSelect } from './deckselect';
import { closePicker, pickerPanel } from './picker';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Longest edge kept in memory. Phone photos are far larger than OCR can use. */
const MAX_EDGE = 2600;

/** Remembered while the app is open: several captures usually share a source. */
let stickySource = '';
let stickyDeck = '';
/** Text shared in from another app, waiting for the capture screen to open. */
let pendingShare: Shared | null = null;

export function setPendingShare(s: Shared): void {
  pendingShare = s;
}

async function toCanvas(source: Blob | HTMLVideoElement): Promise<HTMLCanvasElement> {
  let width: number;
  let height: number;
  let drawable: CanvasImageSource;
  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source); // honours the photo's EXIF rotation
    width = bitmap.width;
    height = bitmap.height;
    drawable = bitmap;
  } else {
    width = source.videoWidth;
    height = source.videoHeight;
    drawable = source;
  }
  if (!width || !height) throw new Error('That image has no pixels to read.');
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = h('canvas', { width: Math.round(width * scale), height: Math.round(height * scale) });
  canvas.getContext('2d')!.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Cut out the chosen region and make it easier to read:
 * - a hand-drawn box is widened a little, since boxes drawn tight clip strokes;
 * - small regions are enlarged (the engine wants characters about 30 px tall);
 * - a border in the background colour is added, because text within a few
 *   pixels of the image edge is badly misread (measured: a one-line crop went
 *   from garbled to perfect with a 30 px border);
 * - light-on-dark images such as dark-mode screenshots are inverted.
 */
export function prepareForOcr(source: HTMLCanvasElement, crop: Rect | null): HTMLCanvasElement {
  let r = { x: 0, y: 0, w: source.width, h: source.height };
  if (crop) {
    // People draw boxes that just touch the text, and clipped strokes wreck
    // recognition, so the box is widened by a fifth of its height on every side.
    const grow = Math.round(Math.max(8, crop.h * 0.2));
    const x = Math.max(0, crop.x - grow);
    const y = Math.max(0, crop.y - grow);
    r = { x, y, w: Math.min(source.width, crop.x + crop.w + grow) - x, h: Math.min(source.height, crop.y + crop.h + grow) - y };
  }
  const edge = Math.max(r.w, r.h);
  const scale = edge < 1000 ? Math.min(3, 1400 / edge) : 1;
  const w = Math.max(1, Math.round(r.w * scale));
  const hgt = Math.max(1, Math.round(r.h * scale));
  const border = Math.round(Math.max(30, Math.min(w, hgt) * 0.08));
  const out = h('canvas', { width: w + border * 2, height: hgt + border * 2 });
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, r.x, r.y, r.w, r.h, border, border, w, hgt);

  // Background colour: the average of the region's four corners.
  const corner = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data;
  const corners = [corner(border, border), corner(border + w - 1, border), corner(border, border + hgt - 1), corner(border + w - 1, border + hgt - 1)];
  const avg = (i: number) => Math.round(corners.reduce((n, c) => n + c[i]!, 0) / corners.length);
  ctx.fillStyle = `rgb(${avg(0)},${avg(1)},${avg(2)})`;
  ctx.fillRect(0, 0, out.width, border);
  ctx.fillRect(0, border + hgt, out.width, border);
  ctx.fillRect(0, border, border, hgt);
  ctx.fillRect(border + w, border, border, hgt);

  const { data } = ctx.getImageData(0, 0, out.width, out.height);
  let sum = 0;
  let n = 0;
  const step = Math.max(4, Math.floor(data.length / 4 / 20_000) * 4); // sample ~20k pixels
  for (let i = 0; i < data.length; i += step) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    n++;
  }
  if (n > 0 && sum / n < 110) {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  return out;
}

export function captureView(): View {
  let image: HTMLCanvasElement | null = null;
  let crop: Rect | null = null;
  let videoUrl: string | null = null;
  let busy = false;
  let destroyed = false;
  let rebuild: ReturnType<typeof setTimeout> | undefined;

  const stage = h('div', { id: 'capture-stage' });
  const status = h('p', { class: 'muted small', id: 'ocr-status', style: 'min-height:20px;margin:8px 0' });
  const text = h('textarea', {
    id: 'capture-text',
    lang: 'ja',
    rows: 4,
    spellcheck: false,
    placeholder: 'Japanese text appears here. You can also paste or type it, or dictate with your keyboard’s microphone.',
  });
  const source = h('input', { type: 'text', id: 'capture-source', value: stickySource, placeholder: 'e.g. email from 総務, meeting slide', autocomplete: 'off' });
  source.addEventListener('change', () => {
    stickySource = source.value.trim();
  });
  const deck = deckSelect(stickyDeck, 'capture-deck');
  deck.el.addEventListener('change', () => {
    stickyDeck = deck.value();
  });
  const pickHost = h('div', { id: 'capture-pick' });

  function renderPicker(): void {
    closePicker();
    const value = text.value.trim();
    if (!value) {
      pickHost.replaceChildren();
      return;
    }
    pickHost.replaceChildren(
      h('h2', null, 'Pick words'),
      h('div', { class: 'card' }, pickerPanel({ text: value, source: () => source.value.trim(), deck: () => (stickyDeck = deck.value()), tags: [] })),
    );
  }
  text.addEventListener('input', () => {
    clearTimeout(rebuild);
    rebuild = setTimeout(renderPicker, 350);
  });

  function setText(value: string): void {
    text.value = value;
    renderPicker();
  }

  // Shared in from another app (Android share sheet): straight to picking.
  const shared = pendingShare;
  pendingShare = null;
  let shareNote: HTMLElement | null = null;
  if (shared) {
    source.value = shared.source;
    stickySource = shared.source;
    if (shared.text) setTimeout(() => setText(shared.text), 0);
    else
      shareNote = h(
        'div',
        { class: 'notice info', id: 'share-note' },
        'Only a link was shared, with no text. Open the page, select the Japanese you want, and share that selection to Goi instead.',
      );
  }

  // ---- Image stage: preview, drag to select a region, read ---------------

  function showImage(canvas: HTMLCanvasElement): void {
    image = canvas;
    crop = null;
    const maxH = Math.max(220, window.innerHeight * 0.5);
    const box = h('div', { class: 'crop-box' });
    const frame = h('div', { class: 'crop-frame', id: 'crop-frame' }, canvas, box);
    canvas.style.maxHeight = `${maxH}px`;
    const hint = h('p', { class: 'muted small', style: 'margin:6px 0' }, 'Drag across the image to read only that part.');
    const readBtn = h('button', { class: 'primary big', id: 'ocr-read', onclick: () => void read() }, 'Read text');
    const clearBtn = h('button', { class: 'link small', style: 'visibility:hidden', onclick: () => setCrop(null) }, 'Clear selection');

    function setCrop(r: Rect | null): void {
      crop = r;
      clearBtn.style.visibility = r ? 'visible' : 'hidden';
      readBtn.textContent = r ? 'Read selected part' : 'Read text';
      if (!r) {
        box.style.display = 'none';
        return;
      }
      const k = canvas.clientWidth / canvas.width;
      Object.assign(box.style, {
        display: 'block',
        left: `${r.x * k}px`,
        top: `${r.y * k}px`,
        width: `${r.w * k}px`,
        height: `${r.h * k}px`,
      });
    }

    let origin: { x: number; y: number } | null = null;
    const point = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const k = canvas.width / b.width;
      return {
        x: Math.min(canvas.width, Math.max(0, (e.clientX - b.left) * k)),
        y: Math.min(canvas.height, Math.max(0, (e.clientY - b.top) * k)),
      };
    };
    frame.addEventListener('pointerdown', (e) => {
      origin = point(e);
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (!origin) return;
      const p = point(e);
      setCrop({ x: Math.min(origin.x, p.x), y: Math.min(origin.y, p.y), w: Math.abs(p.x - origin.x), h: Math.abs(p.y - origin.y) });
    });
    const end = () => {
      origin = null;
      // A tap, or a sliver too small to hold text, clears the selection.
      if (crop && (crop.w < 24 || crop.h < 12)) setCrop(null);
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);

    const existingVideo = stage.querySelector('.video-wrap');
    stage.replaceChildren(...(existingVideo ? [existingVideo] : []), frame, h('div', { class: 'row spread' }, hint, clearBtn), readBtn);
    status.textContent = '';
  }

  async function read(): Promise<void> {
    if (!image || busy) return;
    busy = true;
    const btn = stage.querySelector<HTMLButtonElement>('#ocr-read');
    if (btn) btn.disabled = true;
    try {
      const raw = await recognize(prepareForOcr(image, crop), (label, fraction) => {
        if (!destroyed) status.textContent = `${label}… ${Math.round(fraction * 100)}%`;
      });
      if (destroyed) return;
      const cleaned = cleanCapturedText(raw);
      if (!cleaned) {
        status.textContent = 'No text found. Try dragging a box tightly around the lines you want, or a sharper image.';
        return;
      }
      status.textContent = 'Done. Check the text below — recognition makes mistakes, especially with similar-looking kanji.';
      setText(cleaned);
      pickHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      status.textContent = '';
      toast((err as Error)?.message ?? String(err), undefined, 9000);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function loadImage(blob: Blob): Promise<void> {
    try {
      showImage(await toCanvas(blob));
    } catch (err) {
      toast(`Couldn’t open that image (${(err as Error)?.message ?? err}).`, undefined, 7000);
    }
  }

  // ---- Video: scrub to the frame with the text, then treat it as an image --

  function loadVideo(file: Blob): void {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    const video = h('video', { id: 'capture-video', src: videoUrl, controls: true, playsInline: true, muted: true, preload: 'metadata' });
    video.addEventListener('error', () => toast('This browser can’t play that video format.', undefined, 7000));
    const grab = h(
      'button',
      {
        class: 'block',
        id: 'video-grab',
        onclick: async () => {
          try {
            video.pause();
            showImage(await toCanvas(video));
          } catch {
            toast('No frame to read yet. Play or scrub the video first.');
          }
        },
      },
      'Use this frame',
    );
    image = null;
    stage.replaceChildren(
      h('div', { class: 'video-wrap' }, video, h('p', { class: 'muted small', style: 'margin:6px 0' }, 'Pause on the frame that shows the text, then use it.'), grab),
    );
  }

  // ---- Inputs --------------------------------------------------------------

  const fileInput = (id: string, accept: string, capture: boolean, onFile: (f: File) => void) => {
    const input = h('input', { type: 'file', id, accept, style: 'display:none', capture: capture ? 'environment' : null });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (f) onFile(f);
    });
    return input;
  };
  const cameraInput = fileInput('capture-camera', 'image/*', true, (f) => void loadImage(f));
  const imageInput = fileInput('capture-image', 'image/*', false, (f) => void loadImage(f));
  const videoInput = fileInput('capture-video-file', 'video/*', false, loadVideo);

  async function pasteFromClipboard(): Promise<void> {
    try {
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type) {
            await loadImage(await item.getType(type));
            return;
          }
        }
      }
      const pasted = await navigator.clipboard.readText();
      if (pasted.trim()) setText(pasted.trim());
      else toast('The clipboard has no text or image.');
    } catch {
      toast('The browser didn’t allow reading the clipboard. Paste into the text box instead (Ctrl+V or long-press).', undefined, 7000);
    }
  }

  /** Ctrl+V anywhere on this screen: a screenshot goes to the reader, text to the text box. */
  function onPaste(e: ClipboardEvent): void {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void loadImage(file);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return; // normal paste into a field
    const pasted = e.clipboardData?.getData('text/plain') ?? '';
    if (pasted.trim()) {
      e.preventDefault();
      setText(pasted.trim());
    }
  }
  function onDrop(e: DragEvent): void {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    if (file.type.startsWith('video/')) loadVideo(file);
    else if (file.type.startsWith('image/')) void loadImage(file);
  }
  const onDragOver = (e: DragEvent) => e.preventDefault();
  document.addEventListener('paste', onPaste);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragover', onDragOver);

  const el = h(
    'div',
    { class: 'page' },
    h('h1', null, 'Capture'),
    shareNote,
    h('p', { class: 'muted small' }, 'Get Japanese text in from a photo, a screenshot or a paste, then tap the words you want. Images are read on this device and never uploaded.'),
    h(
      'div',
      { class: 'capture-buttons' },
      h('button', { id: 'btn-camera', onclick: () => cameraInput.click() }, '📷 Photo'),
      h('button', { id: 'btn-image', onclick: () => imageInput.click() }, '🖼 Image'),
      h('button', { id: 'btn-video', onclick: () => videoInput.click() }, '🎞 Video'),
      h('button', { id: 'btn-paste', onclick: () => void pasteFromClipboard() }, '📋 Paste'),
    ),
    cameraInput,
    imageInput,
    videoInput,
    stage,
    status,
    h('label', { class: 'field' }, h('span', null, 'Text'), text),
    h('label', { class: 'field' }, h('span', null, 'Source for cards added from this (optional)'), source),
    h('div', { class: 'field' }, h('span', { class: 'muted small', style: 'display:block;margin-bottom:4px' }, 'Deck for cards added from this'), deck.el),
    pickHost,
    h(
      'details',
      { style: 'margin-top:8px' },
      h('summary', null, 'What to expect'),
      h(
        'ul',
        { class: 'small muted' },
        h('li', null, 'Screenshots and flat, well-lit printed text read well. Photos of signs, handwriting, stylised fonts and vertical text often don’t.'),
        h('li', null, 'The first read downloads the reader and Japanese model (about 5 MB) from this app’s own address. After that it works offline.'),
        h('li', null, 'Your phone and Windows have stronger built-in text recognition (camera or gallery “T” button, Snipping Tool “Text actions”). Copy from those and use Paste here for difficult images.'),
        h('li', null, 'For speech, use the microphone on your keyboard in the text box. The app has no speech recognition of its own.'),
      ),
    ),
  );

  return {
    el,
    destroy: () => {
      destroyed = true;
      clearTimeout(rebuild);
      closePicker();
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', onDragOver);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      void disposeOcr();
    },
  };
}
