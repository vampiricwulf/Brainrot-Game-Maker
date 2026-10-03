import { describe, expect, it } from 'vitest';
import { uploadedFamily } from './fonts';
import { defaultEdits } from './imageedit';
import { isBoard, newImageEl, type MediaRef } from './model';
import { jeopardyGame } from './testgame';
import { mediaUsage } from './usage';

const font = (id: string): MediaRef => ({ id, name: `${id}.ttf`, mime: 'font/ttf', size: 1, kind: 'font' });
const css = (id: string) => `'${uploadedFamily(id)}', sans-serif`;

describe('media usage', () => {
  it('counts uploaded fonts the theme uses, so Remove unused keeps them', () => {
    const game = jeopardyGame();
    game.media.push(font('board0001'), font('value0001'), font('clue00001'), font('spare0001'));
    game.theme.boardFont = css('board0001');
    game.theme.valueFont = css('value0001');
    game.theme.clueFont = css('clue00001');
    const used = mediaUsage(game);
    expect([used.get('board0001'), used.get('value0001'), used.get('clue00001'), used.get('spare0001')]).toEqual([1, 1, 1, undefined]);
  });

  it('counts fonts of text drawn onto pictures', () => {
    const game = jeopardyGame();
    game.media.push(font('drawn0001'));
    const img = newImageEl('pic');
    const text = { id: 't', text: 'Hi', x: 0.5, y: 0.5, size: 0.1, color: '#fff', stroke: '#000', strokeWidth: 0, rotation: 0 };
    img.edits = { ...defaultEdits(), texts: [{ ...text, font: css('drawn0001') }] };
    const round = game.rounds[0];
    if (isBoard(round)) round.categories[0].clues[0].questionSlide.elements.push(img);
    expect(mediaUsage(game).get('drawn0001')).toBe(1);
  });
});
