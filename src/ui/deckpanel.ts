/** The Decks section of the More screen: counts, rename, move out, delete. */
import { deckLabel, deckNames } from '../decks';
import { refresh, store } from './app';
import { h, plural, toast } from './dom';

export function deckSection(): HTMLElement {
  const box = h('div', { id: 'deck-list' });

  function render(): void {
    const live = store.live();
    const decks = deckNames(live);
    box.replaceChildren(
      ...decks.map((d) => {
        const ids = live.filter((c) => c.deck === d).map((c) => c.id);
        const actions = h('div', { class: 'row wrap', style: 'margin-top:6px' });
        const confirm = h('div');
        const renameInput = h('input', { type: 'text', value: d, 'aria-label': `New name for ${deckLabel(d)}`, style: 'flex:1;min-width:140px' });
        const rename = async () => {
          const to = renameInput.value.trim();
          if (to === d) return;
          if (to !== '' && decks.includes(to) && !window.confirm(`A deck called ${to} exists. Merge ${deckLabel(d)} into it?`)) return;
          await store.setDeck(ids, to);
          toast(`Moved ${plural(ids.length, 'card')} to ${deckLabel(to)}.`);
          refresh();
        };
        actions.append(
          renameInput,
          h('button', { onclick: () => void rename() }, d === '' ? 'Move all to' : 'Rename'),
          d !== ''
            ? h(
                'button',
                {
                  class: 'danger',
                  onclick: () =>
                    confirm.replaceChildren(
                      h(
                        'div',
                        { class: 'notice danger' },
                        h('p', null, `${deckLabel(d)} has ${plural(ids.length, 'card')}. Keep the cards and move them to ${deckLabel('')}, or delete them with their deck?`),
                        h(
                          'div',
                          { class: 'row wrap' },
                          h(
                            'button',
                            {
                              onclick: async () => {
                                await store.setDeck(ids, '');
                                toast(`Moved ${plural(ids.length, 'card')} to ${deckLabel('')}.`);
                                refresh();
                              },
                            },
                            `Keep, move to ${deckLabel('')}`,
                          ),
                          h(
                            'button',
                            {
                              class: 'danger solid',
                              onclick: async () => {
                                await store.deleteCards(ids);
                                toast(`Deleted ${deckLabel(d)} and its ${plural(ids.length, 'card')}.`);
                                refresh();
                              },
                            },
                            'Delete deck and cards',
                          ),
                          h('button', { onclick: () => confirm.replaceChildren() }, 'Cancel'),
                        ),
                      ),
                    ),
                },
                'Remove…',
              )
            : '',
        );
        return h(
          'div',
          { class: 'card', dataset: { deck: d }, style: 'margin-bottom:8px' },
          h('div', { class: 'row spread' }, h('b', null, deckLabel(d)), h('a', { href: `#/browse?filter=all&deck=${encodeURIComponent(d)}`, class: 'small' }, `${plural(ids.length, 'card')} →`)),
          actions,
          confirm,
        );
      }),
    );
  }
  render();

  return h(
    'section',
    { id: 'sec-decks' },
    h('h2', null, 'Decks'),
    h(
      'p',
      { class: 'small' },
      'Each card belongs to one deck. Choose which decks to study on the Today screen; the daily limits are shared. A new deck appears when you pick “New deck…” while adding a card, or load a starter deck below.',
    ),
    box,
  );
}
