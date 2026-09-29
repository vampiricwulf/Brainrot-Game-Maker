// Walk every slide in a game (for media usage counts, validation and bulk edits).
import { uploadedFamily } from './fonts';
import { finalName, type EmbedEl, type Game, type Slide } from './model';

export interface SlideRef {
  slide: Slide;
  where: string;
}

export function allSlides(game: Game): SlideRef[] {
  const out: SlideRef[] = [];
  for (const r of game.rounds)
    for (const c of r.categories)
      c.clues.forEach((cl, i) => {
        if (cl.empty) return;
        const where = `${r.name} · ${c.title || 'Category'} #${i + 1}`;
        out.push({ slide: cl.questionSlide, where: `${where} (question)` }, { slide: cl.answerSlide, where: `${where} (answer)` });
      });
  if (game.final.enabled) {
    out.push({ slide: game.final.questionSlide, where: `${finalName(game)} (question)` });
    out.push({ slide: game.final.answerSlide, where: `${finalName(game)} (answer)` });
  }
  if (game.tiebreaker) {
    out.push({ slide: game.tiebreaker.questionSlide, where: 'Tiebreaker (question)' });
    out.push({ slide: game.tiebreaker.answerSlide, where: 'Tiebreaker (answer)' });
  }
  return out;
}

/** How many times each media id is used anywhere in the game. */
export function mediaUsage(game: Game): Map<string, number> {
  const n = new Map<string, number>();
  const bump = (id?: string) => id && n.set(id, (n.get(id) ?? 0) + 1);
  for (const { slide } of allSlides(game)) {
    bump(slide.background.image);
    for (const el of slide.elements) {
      if (el.kind === 'image') {
        bump(el.media);
        bump(el.editedMedia);
      } else if (el.kind === 'video' || el.kind === 'audio') bump(el.media);
    }
  }
  for (const r of game.rounds) for (const c of r.categories) for (const cl of c.clues) bump(cl.tileFace?.image);
  const fonts = game.media.filter((m) => m.kind === 'font');
  if (fonts.length) {
    const used = allSlides(game).flatMap(({ slide }) => slide.elements.flatMap((e) => (e.kind === 'text' ? [e.font] : [])));
    for (const f of fonts) {
      const fam = uploadedFamily(f.id);
      const count = used.filter((u) => u.includes(fam)).length;
      if (count) n.set(f.id, count);
    }
  }
  for (const id of extraMediaRefs(game)) bump(id);
  return n;
}

/** Media referenced outside slides: game sounds (and later wheel/dice/theme media). */
export function extraMediaRefs(game: Game): string[] {
  const out = Object.values(game.audio ?? {}).filter((x): x is string => !!x);
  if (game.theme?.boardImage) out.push(game.theme.boardImage);
  for (const w of game.wheels ?? []) for (const s of w.segments) if (s.media) out.push(s.media);
  for (const d of game.dice ?? []) {
    for (const die of d.dice) for (const f of die.customFaces ?? []) if (f.media) out.push(f.media);
    for (const t of d.totalOutcomes ?? []) if (t.outcome.media) out.push(t.outcome.media);
  }
  return out;
}

export function allEmbeds(game: Game): { el: EmbedEl; where: string }[] {
  return allSlides(game).flatMap(({ slide, where }) =>
    slide.elements.flatMap((e) => (e.kind === 'embed' ? [{ el: e, where }] : [])),
  );
}

/** Does a slide show anything besides empty text? */
export function slideHasContent(slide: Slide): boolean {
  return slide.elements.some((e) => e.kind !== 'text' || e.text.trim() !== '');
}
