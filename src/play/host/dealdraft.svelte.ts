// 🎭 Deal…'s setup (the deal chosen, its parts as changed for this deal, who's dealt in and the host's picks), kept
// while this page is open: closing the menu and opening it again finds it as it was, and ↻ Deal again deals it once
// more. On the host's computer only: never in the session or the live state, which the viewers' windows get (the
// picks say who gets which part).
import type { CardTo, DealPreset, Id, WheelPreset } from '../../lib/model';

export const dealDraft = $state<{
  /** The game it's for (another game opened starts afresh). */
  game?: Id;
  /** The deal being set up: a copy of a saved or ready-made one (changing it here changes only this deal). */
  work: DealPreset | null;
  /** Where it came from: `saved:<id>` or `tpl:<key>`. */
  from: string;
  /** The host's own picks, by part (two windows only: in one, viewers would see them). */
  picks: Record<Id, CardTo[]>;
  /** Those left out of the deal (toKey). */
  skip: string[];
  /** The deal on the table this setup dealt (its id): ↻ Deal again deals it the same way. */
  dealt?: Id;
  /** A ready-made wheel (wheeltemplates.ts) its cards draw from, kept here: it isn't added to the game. */
  extra?: { key: string; wheel: WheelPreset };
}>({ work: null, from: '', picks: {}, skip: [] });
