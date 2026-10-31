// 🎨 Theme's preview takes clicks: a click on a part of the board (or of a clue) finds the setting that colors it
// (opened and flashed). The preview is a picture only (inert), so the part under the pointer is found by where each
// part is.

export type PreviewPart = 'value' | 'tile' | 'header' | 'plate' | 'bar' | 'clueText' | 'slide' | 'board';

/**
 * The parts a click can land on, the innermost first (a value is on a tile, a plate on the score bar, a clue's text on
 * its slide). A full-screen slide (a clue, the Final's question, a slides round) is drawn in the tile color.
 */
export const PREVIEW_PARTS: readonly { part: Exclude<PreviewPart, 'board'>; sel: string }[] = [
  { part: 'value', sel: '.board .tile .v' },
  { part: 'tile', sel: '.board .tile' },
  { part: 'header', sel: '.board .header' },
  { part: 'plate', sel: '.score-area .plate' },
  { part: 'bar', sel: '.score-area .bar' },
  { part: 'clueText', sel: '.full .slide .text' },
  { part: 'slide', sel: '.full' },
];

/** Each part's setting: its data-place on the Theme page, and its name. Anything else is the board's background. */
export const PREVIEW_SETTING: Record<PreviewPart, { place: string; name: string }> = {
  value: { place: 'theme:value', name: 'Values' },
  tile: { place: 'theme:tile', name: 'Tiles & slide background' },
  header: { place: 'theme:boardText', name: 'Category names' },
  plate: { place: 'theme:plateShape', name: 'Score plates' },
  bar: { place: 'theme:scoreBarBg', name: 'Score bar' },
  clueText: { place: 'theme:clueColor', name: 'Clue text' },
  slide: { place: 'theme:tile', name: 'Tiles & slide background' },
  board: { place: 'theme:boardImage', name: 'Board' },
};

type Box = { left: number; top: number; right: number; bottom: number };

/** The part at (x, y): the first of PREVIEW_PARTS' order with a box around the point, else the board. */
export function partAt(x: number, y: number, boxes: readonly { part: PreviewPart; box: Box }[]): PreviewPart {
  const inside = (b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  for (const { part } of PREVIEW_PARTS) if (boxes.some((b) => b.part === part && inside(b.box))) return part;
  return 'board';
}
