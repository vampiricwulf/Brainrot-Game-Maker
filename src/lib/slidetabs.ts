// A slide tab's right-click menu (a clue's, the tiebreaker's, a Final's, a slides round's), in the editors' one order
// (menuOf), and its tooltip. One builder for the clue editor's tabs and SlideTabs, so both say the same.
import { menuItem, menuOf, type MenuEntry } from './menustate.svelte';
import { short } from './layerlabel';
import { MAX_CARDS } from './model';

/** What a slide tab's menu does: the editor that has the tabs runs each on the tab it's for. */
export interface SlideTabActs {
  duplicate: () => void;
  copy: () => void;
  /** 📋 Paste the copied slide as a new slide (after a question slide, before the answer), or over this one. */
  paste: (over: boolean) => void;
  move: (d: -1 | 1) => void;
  remove: () => void;
  /** The Answer's ＋ Add a question slide before it. */
  add: () => void;
  /** A 🤫 card's: its Card name box (F2), ⧉ Same as the answer and 📱 On their phone. */
  rename?: () => void;
  sameAsAnswer?: () => void;
  phone?: () => void;
}

export interface SlideTabMenu {
  /** A question slide's tab, the Answer's, or a 🤫 card's. */
  tab: 'q' | 'a' | 'card';
  /** The heading: the tab's own name ("Question 2", "Answer slide", "🤫 Clue tip"). */
  name: string;
  /** Its place among the question slides (a card's among the cards), and how many there are. */
  at: number;
  count: number;
  /** Slides with nothing to answer (a slides round): "slide", never "question slide". */
  plain?: boolean;
  /** A slide is copied to paste. */
  copied: boolean;
  /**
   * False when items were copied since the slide: Ctrl+V on the tab then pastes those onto the slide, so its paste as a
   * new slide shows no key.
   */
  newest?: boolean;
  /** A card's: it has nothing on it yet (⧉ Same as the answer), the answer has, 📱 On their phone is on, the cards are full. */
  card?: { empty: boolean; answer: boolean; phone: boolean; full: boolean };
}

/**
 * A slide tab's menu. A question slide's: ⧉ Duplicate slide, 📋 Copy slide, 📋 Paste as a new slide after it (Ctrl+V,
 * the safe one, while the slide is what was copied last), 📋 Paste over it, ◀ ▶, 🗑 Delete slide. The Answer's: 📋 Copy slide, its pastes, ＋ Add a question slide
 * before it. A 🤫 card's: ⧉ Same as the answer and 📱 On their phone, ✎ Rename (F2), ⧉ Duplicate card, 📋 Copy slide,
 * ◀ ▶ and 🗑 Delete card (no paste: Ctrl+V there pastes items on the card, as on its slide).
 */
export function slideTabMenu(m: SlideTabMenu, act: SlideTabActs): MenuEntry[] {
  const copy = menuItem.copy(act.copy, { label: '📋 Copy slide', hint: 'The whole slide, to paste as a new slide or over another one (in this game or another)' });
  const off = !m.copied ? { disabled: true, hint: 'Copy a slide first (📋 Copy slide)' } : {};
  /** The paste as a new slide: Ctrl+V on the tab does it, unless items were copied since (it pastes those). */
  const asNew = m.copied && m.newest === false ? { keys: false as const, hint: 'Ctrl+V on the tab pastes the items you copied since, onto the slide' } : {};
  const moves = (what: string) => [
    menuItem.left(() => act.move(-1), { label: '◀ Move earlier', disabled: m.at === 0, hint: `Move this ${what} one place earlier` }),
    menuItem.right(() => act.move(1), { label: '▶ Move later', disabled: m.at >= m.count - 1, hint: `Move this ${what} one place later` }),
  ];
  if (m.tab === 'card') {
    const c = m.card ?? { empty: false, answer: false, phone: false, full: false };
    return menuOf({
      heading: m.name,
      verbs: [
        { label: '⧉ Same as the answer', onclick: () => act.sameAsAnswer?.(), disabled: !c.empty || !c.answer, hint: !c.empty ? 'Only on an empty card' : !c.answer ? 'The answer slide is empty' : 'A copy of the answer slide on this card, once' },
        { label: `${c.phone ? '✓ ' : ''}📱 On their phone`, onclick: () => act.phone?.(), hint: 'The card exactly as a player’s phone gets it' },
      ],
      rename: menuItem.rename(() => act.rename?.()),
      duplicate: menuItem.duplicate(act.duplicate, { label: '⧉ Duplicate card', disabled: c.full, hint: c.full ? `It holds ${MAX_CARDS} cards` : undefined }),
      copy,
      move: moves('card'),
      // (Delete on a card's tab does nothing, as on the Answer's: this is the way, or 🗑 Delete card by the tabs.)
      delete: menuItem.delete('card', act.remove, { keys: false }),
    });
  }
  if (m.tab === 'a')
    return menuOf({
      heading: m.name,
      copy,
      paste: [
        menuItem.paste(() => act.paste(false), { label: '📋 Paste as a new slide before it', ...off, ...asNew }),
        { label: '📋 Paste over it', onclick: () => act.paste(true), ...off },
      ],
      insert: [{ label: '＋ Add a question slide before it', onclick: act.add }],
    });
  const slide = m.plain ? 'slide' : 'question slide';
  return menuOf({
    heading: m.name,
    duplicate: menuItem.duplicate(act.duplicate, { label: '⧉ Duplicate slide', hint: 'A copy of it, right after it' }),
    copy,
    paste: [menuItem.paste(() => act.paste(false), { label: '📋 Paste as a new slide after it', ...off, ...asNew }), { label: '📋 Paste over it', onclick: () => act.paste(true), ...off }],
    move: moves(slide),
    delete: menuItem.delete('slide', act.remove, { disabled: m.count < 2, hint: m.count < 2 ? `The only ${slide} stays (empty it instead)` : undefined }),
  });
}

/** A slide tab's tooltip: its name and the slide's first words ("S3 · House rules"), then `more`. */
export function slideTabTitle(name: string, words: string, more?: string): string {
  const w = short(words);
  return `${name} · ${w ? `“${w}”` : '(no words yet)'}${more ? `\n${more}` : ''}`;
}
