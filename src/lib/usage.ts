// Walk every slide in a game (for media usage counts, validation and bulk edits).
import { uploadedFamily } from './fonts';
import { boardRounds, categoryLabel, isBoard, isBoardGame, isFinal, roundName, type Action, type EmbedEl, type Game, type Outcome, type Slide } from './model';

export interface SlideRef {
  slide: Slide;
  where: string;
}

export function allSlides(game: Game): SlideRef[] {
  const out: SlideRef[] = [];
  game.rounds.forEach((r, ri) => {
    if (isBoard(r))
      for (const c of r.categories)
        c.clues.forEach((cl, i) => {
          if (cl.empty) return;
          const where = `${roundName(r, ri)} · ${categoryLabel(c)} #${i + 1}`;
          out.push({ slide: cl.questionSlide, where: `${where} (question)` });
          cl.extraSlides?.forEach((slide, j) => out.push({ slide, where: `${where} (question slide ${j + 2})` }));
          out.push({ slide: cl.answerSlide, where: `${where} (answer)` });
        });
    else if (isFinal(r)) {
      out.push({ slide: r.questionSlide, where: `${roundName(r, ri)} (question)` });
      out.push({ slide: r.answerSlide, where: `${roundName(r, ri)} (answer)` });
    }
  });
  // RPG worlds: every screen, and the slides objects and actions show (dialogue, pop-ups, questions).
  for (const w of game.worlds ?? [])
    for (const m of w.maps)
      for (const sc of m.screens) {
        for (const look of [{ name: '', slide: sc.slide }, ...(sc.variants ?? [])]) {
          const where = `${w.name} · ${m.name} · ${sc.name}${look.name ? ` (${look.name})` : ''}`;
          out.push({ slide: look.slide, where });
          for (const el of look.slide.elements) {
            if (el.role?.dialogue) out.push({ slide: el.role.dialogue, where: `${where} · ${el.name || 'object'} (dialogue)` });
            for (const s of actionSlides(el.role?.actions)) out.push({ slide: s, where: `${where} · ${el.name || 'object'}` });
          }
        }
      }
  game.rounds.forEach((r, ri) => {
    if (!isBoardGame(r)) return;
    const name = roundName(r, ri);
    out.push({ slide: r.slide, where: `${name} (board)` });
    for (const z of r.zones) out.push({ slide: z.slide, where: `${name} · ${z.name}` });
    for (const sp of r.spaces) for (const s of actionSlides([...(sp.onPass ?? []), ...(sp.onLand ?? [])])) out.push({ slide: s, where: `${name} · ${sp.name}` });
  });
  for (const { name, outcome: o } of allOutcomes(game)) for (const s of actionSlides(o.actions)) out.push({ slide: s, where: `${name}: ${o.label}` });
  for (const it of game.items ?? []) for (const s of actionSlides(it.onUse)) out.push({ slide: s, where: `Item: ${it.name}` });
  if (game.tiebreaker) {
    out.push({ slide: game.tiebreaker.questionSlide, where: 'Tiebreaker (question)' });
    out.push({ slide: game.tiebreaker.answerSlide, where: 'Tiebreaker (answer)' });
  }
  return out;
}

/** Slides inside a list of actions (pop-ups and questions). */
function actionSlides(actions: Action[] | undefined): Slide[] {
  const out: Slide[] = [];
  for (const a of actions ?? []) {
    if (a.do === 'popup') out.push(a.slide);
    if (a.do === 'question') out.push(a.question, a.answer);
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
  for (const r of boardRounds(game)) for (const c of r.categories) for (const cl of c.clues) bump(cl.tileFace?.image);
  const fonts = game.media.filter((m) => m.kind === 'font');
  if (fonts.length) {
    // Text on slides, text drawn onto pictures (kept to edit it again), and the theme's category and value fonts.
    const els = [...allSlides(game).flatMap(({ slide }) => slide.elements), ...boardRounds(game).flatMap((r) => r.decor ?? [])];
    const used = els.flatMap((e) => (e.kind === 'text' ? [e.font] : e.kind === 'image' ? (e.edits?.texts ?? []).map((t) => t.font) : []));
    used.push(game.theme?.boardFont ?? '', game.theme?.valueFont ?? '');
    for (const f of fonts) {
      const fam = uploadedFamily(f.id);
      const count = used.filter((u) => u.includes(fam)).length;
      if (count) n.set(f.id, count);
    }
  }
  for (const id of extraMediaRefs(game)) bump(id);
  return n;
}

/** Media referenced outside slides: game sounds, theme images, category and board images, wheel/dice media. */
export function extraMediaRefs(game: Game): string[] {
  const out = Object.values(game.audio ?? {}).filter((x): x is string => !!x);
  if (game.theme?.boardImage) out.push(game.theme.boardImage);
  if (game.theme?.banner) out.push(game.theme.banner);
  for (const r of boardRounds(game)) {
    for (const c of r.categories) if (c.image) out.push(c.image);
    for (const d of r.decor ?? []) {
      out.push(d.media);
      if (d.editedMedia) out.push(d.editedMedia);
    }
  }
  for (const w of game.wheels ?? []) for (const s of w.segments) if (s.media) out.push(s.media);
  for (const d of game.dice ?? []) {
    for (const die of d.dice) for (const f of die.customFaces ?? []) if (f.media) out.push(f.media);
    for (const t of d.totalOutcomes ?? []) if (t.outcome.media) out.push(t.outcome.media);
  }
  // RPG: avatars, item icons, map and screen music, and sounds that actions play.
  for (const p of game.players) if (p.avatar) out.push(p.avatar);
  for (const it of game.items ?? []) {
    if (it.icon) out.push(it.icon);
    if (it.wearable?.image) out.push(it.wearable.image);
    for (const a of it.onUse ?? []) if (a.do === 'sound') out.push(a.media);
  }
  for (const w of game.worlds ?? [])
    for (const m of w.maps) {
      if (m.music) out.push(m.music);
      for (const sc of m.screens) {
        if (sc.music) out.push(sc.music);
        for (const look of [sc.slide, ...(sc.variants ?? []).map((v) => v.slide)])
          for (const el of look.elements) for (const a of el.role?.actions ?? []) if (a.do === 'sound') out.push(a.media);
      }
    }
  for (const r of game.rounds)
    if (isBoardGame(r))
      for (const sp of r.spaces) {
        if (sp.icon) out.push(sp.icon);
        for (const a of [...(sp.onPass ?? []), ...(sp.onLand ?? [])]) if (a.do === 'sound') out.push(a.media);
      }
  for (const { outcome } of allOutcomes(game)) for (const a of outcome.actions ?? []) if (a.do === 'sound') out.push(a.media);
  return out;
}

export function allEmbeds(game: Game): { el: EmbedEl; where: string }[] {
  return allSlides(game).flatMap(({ slide, where }) =>
    slide.elements.flatMap((e) => (e.kind === 'embed' ? [{ el: e, where }] : [])),
  );
}

/** How many things the game plays from the internet: the live-link files it uses, and online players. */
export function onlineCount(game: Game): number {
  const used = mediaUsage(game);
  return game.media.filter((m) => m.url && used.has(m.id)).length + allEmbeds(game).length;
}

/** Does a slide show anything besides empty text? */
export function slideHasContent(slide: Slide): boolean {
  return slide.elements.some((e) => e.kind !== 'text' || e.text.trim() !== '');
}

/** Every wheel slice, die face and dice-total outcome in the game. */
export function allOutcomes(game: Game): { name: string; outcome: Outcome }[] {
  const out: { name: string; outcome: Outcome }[] = [];
  for (const w of game.wheels) for (const o of w.segments) out.push({ name: w.name, outcome: o });
  for (const d of game.dice) {
    for (const die of d.dice) for (const f of die.customFaces ?? []) out.push({ name: d.name, outcome: f });
    for (const t of d.totalOutcomes ?? []) out.push({ name: d.name, outcome: t.outcome });
  }
  return out;
}
