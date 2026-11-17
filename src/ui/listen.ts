import { japaneseVoices, speak, stopSpeaking, ttsSupported } from '../tts';
import { SrsPhase, isInbox, type Card } from '../types';
import { store, type View } from './app';
import { cardBack } from './cardview';
import { h, toast } from './dom';
import { closePicker } from './picker';

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function noVoiceHelp(reason: 'unsupported' | 'no-voice', retry: () => void): HTMLElement {
  return h(
    'div',
    { id: 'tts-help' },
    h(
      'div',
      { class: 'notice' },
      reason === 'unsupported'
        ? 'This browser does not provide speech synthesis, so listening mode can’t play audio here.'
        : 'No Japanese voice is installed on this device, so there is nothing to play audio with. Listening mode uses the voices built into your operating system — it never downloads audio.',
    ),
    h('h2', null, 'Windows 11'),
    h(
      'ol',
      null,
      h('li', null, 'Open Settings → Time & language → Speech.'),
      h('li', null, 'Under “Manage voices”, choose Add voices, search for Japanese, and add it.'),
      h('li', null, 'If Japanese isn’t offered: Settings → Time & language → Language & region → Add a language → 日本語, and tick Text-to-speech.'),
      h('li', null, 'Close and reopen the browser completely, then come back here.'),
    ),
    h('h2', null, 'Android (Galaxy)'),
    h(
      'ol',
      null,
      h('li', null, 'Open Settings → General management → Text-to-speech (on other phones: Settings → Accessibility → Text-to-speech output).'),
      h('li', null, 'Choose “Speech Recognition & Synthesis from Google” (or Samsung TTS) as the preferred engine.'),
      h('li', null, 'Tap the gear icon → Install voice data → 日本語, and download it.'),
      h('li', null, 'Close the browser tab or the installed app, reopen it, and come back here.'),
    ),
    h('button', { class: 'block', id: 'tts-retry', onclick: retry }, 'Check again'),
  );
}

export function listenView(): View {
  const el = h('div', { class: 'page' }, h('h1', null, 'Listen'));
  const host = h('div', null, h('p', { class: 'muted' }, 'Looking for a Japanese voice…'));
  el.append(host);
  let destroyed = false;

  async function init(): Promise<void> {
    if (!ttsSupported()) {
      host.replaceChildren(noVoiceHelp('unsupported', () => void init()));
      return;
    }
    host.replaceChildren(h('p', { class: 'muted' }, 'Looking for a Japanese voice…'));
    const voices = await japaneseVoices();
    if (destroyed) return;
    if (voices.length === 0) {
      host.replaceChildren(noVoiceHelp('no-voice', () => void init()));
      return;
    }
    player(voices);
  }

  function player(voices: SpeechSynthesisVoice[]): void {
    const s = store.settings;
    const studied = store.live().filter((c) => !isInbox(c) && c.srs.recognition.state !== SrsPhase.New);
    // Prefer words already met in review; fall back to the whole deck while it is young.
    const pool = studied.length >= 5 ? studied : store.live().filter((c) => !isInbox(c));
    if (pool.length === 0) {
      host.replaceChildren(h('p', null, 'Listening mode plays your cards aloud. Add a few cards with meanings first.'));
      return;
    }
    let deck = shuffle(pool);
    let index = 0;
    let revealed = false;

    const stage = h('div', { class: 'card', style: 'text-align:center;min-height:220px;display:flex;flex-direction:column;justify-content:center' });
    const status = h('p', { class: 'muted small', style: 'text-align:center;min-height:20px' });

    const voiceSelect = h(
      'select',
      { id: 'tts-voice', 'aria-label': 'Voice' },
      voices.map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === s.ttsVoiceURI }, `${v.name}${v.localService ? '' : ' (online)'}`)),
    );
    voiceSelect.addEventListener('change', () => void store.setSettings({ ttsVoiceURI: voiceSelect.value }));

    const rateLabel = h('span', null, `Speed ${s.ttsRate.toFixed(2)}×`);
    const rate = h('input', { type: 'range', id: 'tts-rate', min: '0.5', max: '1.5', step: '0.05', value: String(s.ttsRate), 'aria-label': 'Speed' });
    rate.addEventListener('input', () => {
      rateLabel.textContent = `Speed ${Number(rate.value).toFixed(2)}×`;
    });
    rate.addEventListener('change', () => void store.setSettings({ ttsRate: Number(rate.value) }));

    const sourceSelect = h(
      'select',
      { id: 'tts-source', 'aria-label': 'What to play' },
      h('option', { value: 'example', selected: s.listenSource === 'example' }, 'Example sentence (word if none)'),
      h('option', { value: 'word', selected: s.listenSource === 'word' }, 'Word only'),
    );
    sourceSelect.addEventListener('change', () => {
      void store.setSettings({ listenSource: sourceSelect.value as 'example' | 'word' });
      void play();
    });

    const current = (): Card => deck[index]!;
    const textFor = (c: Card) => (store.settings.listenSource === 'example' && c.example_ja ? c.example_ja : c.word);

    async function play(): Promise<void> {
      status.textContent = 'Playing…';
      try {
        await speak(textFor(current()), { voiceURI: store.settings.ttsVoiceURI, rate: store.settings.ttsRate });
        if (!destroyed) status.textContent = revealed ? '' : 'Recall the meaning, then reveal.';
      } catch (err) {
        status.textContent = '';
        toast(String((err as Error).message ?? err));
      }
    }

    function render(): void {
      const c = current();
      stage.replaceChildren(
        revealed
          ? cardBack(c, store.settings.furigana, { audio: false })
          : h('div', { class: 'muted', style: 'font-size:44px', 'aria-hidden': 'true' }, '🔊'),
      );
      revealBtn.textContent = revealed ? 'Next' : 'Reveal';
      position.textContent = `${index + 1} / ${deck.length}`;
    }

    function advance(): void {
      if (!revealed) {
        revealed = true;
        render();
        status.textContent = '';
        return;
      }
      index++;
      if (index >= deck.length) {
        deck = shuffle(pool);
        index = 0;
      }
      revealed = false;
      render();
      void play();
    }

    const revealBtn = h('button', { class: 'primary big', id: 'listen-reveal', onclick: advance }, 'Reveal');
    const position = h('span', { class: 'muted small' });
    render();

    host.replaceChildren(
      stage,
      status,
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'grow', id: 'listen-play', onclick: () => void play() }, '▶ Play again'), position),
      revealBtn,
      h('h2', null, 'Voice'),
      h('div', { class: 'stack' }, voiceSelect, h('label', { class: 'field' }, rateLabel, rate), sourceSelect),
      h('p', { class: 'muted small' }, 'Listening is practice only: it doesn’t change the review schedule. Tap Play to start — browsers only allow speech after a tap.'),
    );
    status.textContent = 'Tap Play to hear the first card.';
  }

  void init();
  return {
    el,
    destroy: () => {
      destroyed = true;
      stopSpeaking();
      closePicker();
    },
  };
}
