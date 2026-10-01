// Find (Ctrl+F in the editor): every place in the game whose words match — clues, Final rounds, RPG screens and what's
// on them, board-game spaces and zones, items, stats, shops, wheels, dice, media files — with the place to go
// to (nav.svelte.ts's goTo, as the History tab's Go there).
import { categoryLabel, formatPoints, roundName, type Game, type Slide } from './model';
import type { Place } from './historylabel';

export interface Hit {
  icon: string;
  /** What matched (shortened around the words). */
  text: string;
  /** Where it is: "Round 1 › Memes › $400". */
  where: string;
  place: Place;
  /** What gets the focus there (a CSS selector), when it's a field of its own rather than what flashes. */
  focus?: string;
}

/** Every bit of text on a slide (text boxes, item and object names). */
function slideWords(s: Slide | undefined): string[] {
  return (s?.elements ?? []).flatMap((e) => [e.kind === 'text' ? e.text : '', e.name ?? '']).filter(Boolean);
}

/** The text around the first match, at most `max` characters. */
export function snippet(text: string, q: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const at = Math.max(0, flat.toLowerCase().indexOf(q.toLowerCase()));
  const from = Math.max(0, Math.min(at - 30, flat.length - max));
  return (from > 0 ? '…' : '') + flat.slice(from, from + max).trim() + (from + max < flat.length ? '…' : '');
}

/** Matches for `query` (ignoring case; every word must be in the same bit of text), at most `limit`. */
export function findAll(game: Game, query: string, limit = 200): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  const sym = game.settings.currencySymbol;
  const match = (text: string | undefined) => !!text && words.every((w) => text.toLowerCase().includes(w));
  /** The first text of `texts` that matches, as a hit. */
  const look = (icon: string, texts: (string | undefined)[], where: string, place: Place, focus?: string) => {
    const t = texts.find(match);
    if (t && hits.length < limit) hits.push({ icon, text: snippet(t, words[0]), where, place, ...(focus ? { focus } : {}) });
  };
  /** The field that has the text: the first one of `fields` (selectors, with the texts) that matches. */
  const field = (pairs: [string | undefined, string][]) => pairs.find(([t]) => match(t))?.[1];

  game.rounds.forEach((r, i) => {
    const rn = roundName(r, i);
    const notes = r.mode === 'rpg' || r.mode === 'boardgame' || r.mode === 'final' ? r.hostNotes : undefined;
    look('🏷', [r.name, notes], rn, { tab: 'round', round: r.id }, field([[r.name, 'main [data-round-name]'], [notes, 'main [data-field="round-notes"]']]));
    if (r.mode === 'board') {
      for (const cat of r.categories) {
        const cn = categoryLabel(cat);
        look('🟦', [cat.title], `${rn} › Category`, { tab: 'round', round: r.id, part: { kind: 'category', category: cat.id } }, `[data-place="category:${cat.id}"] textarea`);
        cat.clues.forEach((clue, row) => {
          const where = `${rn} › ${cn} › ${formatPoints(clue.value ?? r.values[row] ?? 0, sym)}`;
          const at = (side?: 'q' | 'a'): Place => ({ tab: 'round', round: r.id, part: { kind: 'clue', category: cat.id, clue: clue.id, side } });
          look('❓', slideWords(clue.questionSlide), `${where} › Question`, at('q'), '[data-field="q"]');
          look('💬', slideWords(clue.answerSlide), `${where} › Answer`, at('a'), '[data-field="a"]');
          look('📝', [clue.hostNotes, clue.tileFace?.text], `${where} › Notes / tile`, at(), field([[clue.hostNotes, '[data-field="notes"]']]));
        });
      }
    } else if (r.mode === 'final') {
      look('⭐', [r.category], `${rn} › Category`, { tab: 'round', round: r.id, part: { kind: 'final', side: 'q' } }, 'main [data-field="final-category"]');
      look('❓', slideWords(r.questionSlide), `${rn} › Question`, { tab: 'round', round: r.id, part: { kind: 'final', side: 'q' } }, 'main [data-field="q"]');
      look('💬', slideWords(r.answerSlide), `${rn} › Answer`, { tab: 'round', round: r.id, part: { kind: 'final', side: 'a' } }, 'main [data-field="a"]');
    } else if (r.mode === 'boardgame') {
      for (const s of r.spaces)
        look('⬤', [s.name, s.hostNotes], `${rn} › Space`, { tab: 'round', round: r.id, part: { kind: 'space', space: s.id } }, field([[s.name, 'main input[aria-label="Space name"]'], [s.hostNotes, 'main [data-field="space-notes"]']]));
      for (const z of r.zones) look('🌀', [z.name, z.hostNotes, ...slideWords(z.slide)], `${rn} › Zone`, { tab: 'round', round: r.id, part: { kind: 'zone', zone: z.id } });
      look('🏆', [r.winNotes], `${rn} › How to win`, { tab: 'round', round: r.id });
    }
  });

  for (const w of game.worlds ?? [])
    for (const m of w.maps)
      for (const s of m.screens) {
        const place: Place = { tab: 'world', world: w.id, map: m.id, screen: s.id };
        const where = `${w.name} › ${m.name}`;
        look('🗺', [s.name, s.hostNotes], `${where} › Screen`, place);
        // What's on it, in each of its looks (and what its characters say).
        for (const v of [{ name: '', slide: s.slide }, ...(s.variants ?? [])]) {
          const said = v.slide.elements.flatMap((e) => (e.role?.dialogue ? slideWords(e.role.dialogue) : []));
          look('🧩', [...slideWords(v.slide), ...said], `${where} › ${s.name}${v.name ? ` (${v.name})` : ''}`, place);
        }
      }

  for (const it of game.items ?? []) look('🎒', [it.name, it.description, it.hostNotes], 'Stats & Items › Item', { tab: 'stats', item: it.id });
  for (const f of game.statFields ?? []) look('📊', [f.name], 'Stats & Items › Stat', { tab: 'stats', stat: f.id });
  for (const sh of game.shops ?? []) look('🛒', [sh.name], 'Stats & Items › Shop', { tab: 'stats', shop: sh.id });
  for (const w of game.wheels) look('🎡', [w.name, ...w.segments.flatMap((s) => [s.label, s.details])], 'Wheels & Dice › Wheel', { tab: 'tools', wheel: w.id });
  for (const d of game.dice)
    look('🎲', [d.name, ...d.dice.flatMap((x) => (x.customFaces ?? []).flatMap((f) => [f.label, f.details])), ...(d.totalOutcomes ?? []).map((t) => t.outcome.label)], 'Wheels & Dice › Dice', { tab: 'tools', dice: d.id });
  for (const m of game.media) look('🖼', [m.name], 'Media', { tab: 'media', media: m.id });
  const tb = game.tiebreaker;
  if (tb) {
    look('❓', slideWords(tb.questionSlide), 'Tiebreaker › Question', { tab: 'tiebreaker', side: 'q' });
    look('💬', [...slideWords(tb.answerSlide), tb.hostNotes], 'Tiebreaker › Answer', { tab: 'tiebreaker', side: 'a' });
  }
  return hits;
}
