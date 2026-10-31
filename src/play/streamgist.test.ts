import { describe, expect, it } from 'vitest';
import { streamGist } from './streamgist';

describe('▶ Play’s 📺 On stream fold, closed', () => {
  it('names the two cards, then only what isn’t the default', () => {
    expect(streamGist({})).toBe('“Starting soon” card · cover card');
    expect(streamGist({ soonText: 'Back in a sec, chat', coverText: 'Snack break', clueCaption: true }, { reduceMotion: true })).toBe(
      '“Back in a sec, chat” · cover “Snack break” · captions on · reduce motion',
    );
  });

  it('a countdown running, the join code hidden with phones on, the RPG caption only with an RPG round', () => {
    expect(streamGist({ hideJoinCode: true, placeCaption: true }, { countdown: '4:12', phones: true })).toBe('“Starting soon” card · countdown 4:12 · cover card · join code hidden');
    expect(streamGist({ hideJoinCode: true, placeCaption: true }, { rpg: true })).toBe('“Starting soon” card · cover card · captions on');
  });

  it('long words typed for a card are cut short', () => {
    expect(streamGist({ soonText: 'We are starting very soon, grab a snack and a drink' })).toBe('“We are starting very so…” · cover card');
  });
});
