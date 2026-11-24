import { describe, expect, it } from 'vitest';
import { pacificDate, stampChangelog } from './changelog';

const TOP = ['# Changelog', '', 'What changed, newest first.', ''];
const NOTES = ['## Notes on the history', '', '| Commit | What it is |', '|---|---|', '| abc1234 | A merge |', ''];
const file = (...blocks: string[][]) => [...TOP, ...blocks.flat(), ...NOTES].join('\n');

describe('the Pacific date', () => {
  it('is the day in Los Angeles, not in UTC', () => {
    // 969022d was committed 2026-11-23 00:36 UTC: still the 22nd in Pacific time (PST, UTC−8).
    expect(pacificDate(new Date('2026-11-23T00:36:00Z'))).toBe('2026-11-22');
    expect(pacificDate(new Date('2026-11-23T08:00:00Z'))).toBe('2026-11-23');
    // Summer is PDT (UTC−7).
    expect(pacificDate(new Date('2026-07-01T06:59:00Z'))).toBe('2026-06-30');
    expect(pacificDate(new Date('2026-07-01T07:00:00Z'))).toBe('2026-07-01');
  });
});

describe('stamping the changelog', () => {
  const unreleased = ['## Unreleased', '', '### Fixed', '', '- A new fix (aaa1111)', '- A long one', '  that goes on (bbb2222)', ''];
  const older = ['## 2026-11-17', '', '### Added', '', '- An old thing (ccc3333)', ''];

  it('puts the Unreleased lines under a new heading for the day, where Unreleased was', () => {
    const r = stampChangelog(file(unreleased, older), '2026-11-22')!;
    expect(r.moved).toBe(2);
    expect(r.merged).toBe(false);
    expect(r.text).toBe(file(['## 2026-11-22', ...unreleased.slice(1)], older));
  });

  it("merges into the day's heading when it has one, the moved lines first in each section and the sections in order", () => {
    const today = ['## 2026-11-22', '', '### Changed', '', '- Pushed this morning (ddd4444)', '', '### Fixed', '', '- An earlier fix (eee5555)', ''];
    const added = ['## Unreleased', '', '### Removed', '', '- A thing gone (fff6666)', '', '### Fixed', '', '- A later fix (aaa1111)', '', '### Added', '', '- A new thing (bbb2222)', ''];
    const r = stampChangelog(file(added, today, older), '2026-11-22')!;
    expect(r.merged).toBe(true);
    expect(r.moved).toBe(3);
    const want = [
      '## 2026-11-22',
      '',
      '### Added',
      '',
      '- A new thing (bbb2222)',
      '',
      '### Changed',
      '',
      '- Pushed this morning (ddd4444)',
      '',
      '### Fixed',
      '',
      '- A later fix (aaa1111)',
      '- An earlier fix (eee5555)',
      '',
      '### Removed',
      '',
      '- A thing gone (fff6666)',
      '',
    ];
    expect(r.text).toBe(file(want, older));
  });

  it('does nothing when Unreleased is empty or missing, so a second run changes nothing', () => {
    const once = stampChangelog(file(unreleased, older), '2026-11-22')!.text;
    expect(stampChangelog(once, '2026-11-22')).toBeNull();
    expect(stampChangelog(file(['## Unreleased', '', '### Fixed', ''], older), '2026-11-22')).toBeNull();
    expect(stampChangelog(file(['## Unreleased', ''], older), '2026-11-22')).toBeNull();
  });

  it('keeps Windows line ends', () => {
    const r = stampChangelog(file(unreleased, older).replace(/\n/g, '\r\n'), '2026-11-22')!;
    expect(r.text).toBe(file(['## 2026-11-22', ...unreleased.slice(1)], older).replace(/\n/g, '\r\n'));
  });

  it('refuses rather than drop text it does not understand', () => {
    expect(() => stampChangelog(file(['## Unreleased', '', '- A line with no section', ''], older), '2026-11-22')).toThrow(/outside a section/);
    expect(() => stampChangelog(file(['## Unreleased', '', '### Security', '', '- Something', ''], older), '2026-11-22')).toThrow(/Security/);
    expect(() => stampChangelog(file(unreleased, older), '22/11/2026')).toThrow(/Not a date/);
    expect(() => stampChangelog(file(unreleased, older), '2026-11-31')).toThrow(/Not a date/);
    expect(() => stampChangelog(file(unreleased, older), '2026-22-11')).toThrow(/Not a date/);
  });

  it('never takes the Notes on the history table for a day', () => {
    const r = stampChangelog(file(unreleased, older), '2026-11-22')!;
    expect(r.text.endsWith(NOTES.join('\n'))).toBe(true);
  });
});
