/** A deck chooser for forms: existing decks plus "New deck…", which reveals a name field. */
import { deckLabel, deckNames } from '../decks';
import { store } from './app';
import { h } from './dom';

const NEW = '\u0000new';

export function deckSelect(current: string, id: string): { el: HTMLElement; value: () => string; set: (deck: string) => void } {
  const select = h('select', { id, 'aria-label': 'Deck' });
  const name = h('input', { type: 'text', id: id + '-new', placeholder: 'new deck name', autocomplete: 'off', style: 'display:none;margin-top:6px' });
  const fill = (chosen: string) => {
    select.replaceChildren(
      ...deckNames(store.cards.values(), [chosen]).map((d) => h('option', { value: d, selected: d === chosen }, deckLabel(d))),
      h('option', { value: NEW }, 'New deck…'),
    );
  };
  fill(current);
  select.addEventListener('change', () => {
    const isNew = select.value === NEW;
    name.style.display = isNew ? '' : 'none';
    if (isNew) name.focus();
  });
  return {
    el: h('div', null, select, name),
    value: () => (select.value === NEW ? name.value.trim() : select.value),
    set: (deck: string) => {
      fill(deck);
      name.style.display = 'none';
    },
  };
}
