// Walk every slide in a game (for media usage counts, validation and bulk edits).
import { uploadedFamily } from './fonts';
import type { EmbedEl, Game, Slide } from './model';

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
    out.push({ slide: game.final.questionSlide, where: 'Final Jeopardy (question)' });
    out.push({ slide: game.final.answerSlide, where: 'Final Jeopardy (answer)' });
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

/** Hook for later milestones (wheel/dice/theme media) to report their references. */
export function extraMediaRefs(game: Game): string[] {
  void game;
  return [];
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
