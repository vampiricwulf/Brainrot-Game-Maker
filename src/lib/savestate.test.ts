import { describe, expect, it } from 'vitest';
import { lastFileSave, SAMPLE_STEP, saveState, untouchedSample } from './savestate';

const at = () => '2:05 PM';

describe('💾 Save says whether the file is up to date', () => {
  it('has its dot only for work a file doesn’t have yet', () => {
    expect(saveState({ work: true, saved: false, sample: false }, at)).toEqual({ changed: true, said: 'Not saved as a file yet' });
    expect(saveState({ work: true, saved: false, sample: false, lastAt: 1 }, at)).toEqual({ changed: true, said: 'Last saved as a file at 2:05 PM, changed since' });
    expect(saveState({ work: true, saved: true, sample: false, lastAt: 1 }, at)).toEqual({ changed: false, said: 'Last saved as a file at 2:05 PM' });
    // A new game, an empty one, a game opened and not changed, and the sample as it came: nothing to say.
    expect(saveState({ work: false, saved: false, sample: false }, at)).toEqual({ changed: false, said: '' });
    expect(saveState({ work: true, saved: true, sample: false }, at)).toEqual({ changed: false, said: '' });
    expect(saveState({ work: true, saved: false, sample: true }, at)).toEqual({ changed: false, said: '' });
  });

  it('takes the time of the newest save as a file (an export isn’t one)', () => {
    expect(lastFileSave([])).toBeUndefined();
    expect(lastFileSave([{ kind: 'saved', ts: 1 }, { kind: 'autosaved', ts: 2 }, { kind: 'exported', ts: 3 }, { kind: 'played', ts: 4 }])).toBe(2);
    expect(lastFileSave([{ kind: 'opened', ts: 1 }, { kind: 'exported', ts: 3 }])).toBeUndefined();
  });

  it('knows the sample as it came: added to a new game, nothing since', () => {
    const h = { pending: false, origin: { kind: 'new' }, entries: [{ label: SAMPLE_STEP }], index: 1 };
    expect(untouchedSample(h)).toBe(true);
    // Changed (a step, or typing not yet a step), undone, added to a game opened from a file, or after another step.
    expect(untouchedSample({ ...h, entries: [{ label: SAMPLE_STEP }, { label: 'Renamed category “Memes”' }], index: 2 })).toBe(false);
    expect(untouchedSample({ ...h, pending: true })).toBe(false);
    expect(untouchedSample({ ...h, index: 0 })).toBe(false);
    expect(untouchedSample({ ...h, origin: { kind: 'opened' } })).toBe(false);
    expect(untouchedSample({ ...h, entries: [{ label: 'Added round “Jeopardy!”' }] })).toBe(false);
  });
});
