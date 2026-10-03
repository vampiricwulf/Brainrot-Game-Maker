import { describe, expect, it } from 'vitest';
import { addedEntries, bumpFor, compareVersions, isNewer, nextVersion, parseVersion, releaseNotes } from './semver';

const v = (s: string) => parseVersion(s)!;

describe('versions', () => {
  it('reads versions, with or without a v, a pre-release and build metadata', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: '' });
    expect(parseVersion('v10.0.1-dev.3+abc')).toEqual({ major: 10, minor: 0, patch: 1, pre: 'dev.3' });
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });

  it('orders them as SemVer does', () => {
    const sorted = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    for (let i = 1; i < sorted.length; i++) expect(compareVersions(v(sorted[i - 1]), v(sorted[i]))).toBeLessThan(0);
    expect(compareVersions(v('1.10.0'), v('1.9.9'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
    expect(isNewer('v1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('1.1.9', '1.1.9')).toBe(false);
    expect(isNewer('nonsense', '1.0.0')).toBe(false);
  });
});

describe('the next release', () => {
  const fix = { section: 'Fixed', text: '- A fix' };
  const add = { section: 'Added', text: '- A thing' };
  it('steps up by what changed: fixes a patch, anything else a minor, a Breaking line a major', () => {
    expect(bumpFor([])).toBe('patch');
    expect(bumpFor([fix])).toBe('patch');
    expect(bumpFor([fix, add])).toBe('minor');
    expect(bumpFor([{ section: 'Changed', text: '- **Breaking**: older versions can’t open new saves' }])).toBe('major');
    expect(bumpFor([{ section: 'Changed', text: '- BREAKING: a new save format' }])).toBe('major');
    expect(bumpFor([{ section: 'Fixed', text: '- **Replace** says so instead of breaking the item.' }])).toBe('patch');
    expect(bumpFor([{ section: 'Changed', text: '- Breaking news ticker style' }])).toBe('minor');
    expect(nextVersion('v1.4.2', '1.0.0', [fix])).toBe('1.4.3');
    expect(nextVersion('v1.4.2', '1.0.0', [add, fix])).toBe('1.5.0');
  });
  it('the first release is the base version, and the base is a floor', () => {
    expect(nextVersion(null, '1.0.0', [add])).toBe('1.0.0');
    expect(nextVersion('v1.4.2', '2.0.0', [fix])).toBe('2.0.0');
  });
});

describe('changelog entries added since the last release', () => {
  const file = [
    '# Changelog',
    '',
    '## 2026-10-02',
    '',
    '### Added',
    '- **New**: a thing',
    '  that wraps.',
    '- Old thing',
    '',
    '### Fixed',
    '- A fix',
    '',
    '## Notes on the history',
    '- not an entry',
  ];
  it('files each added bullet (with its wrapped lines) under its section, leaving the rest out', () => {
    const got = addedEntries(file, new Set([6, 7, 11, 14]));
    expect(got).toEqual([
      { section: 'Added', text: '- **New**: a thing\n  that wraps.' },
      { section: 'Fixed', text: '- A fix' },
    ]);
    expect(releaseNotes(got)).toBe('### Added\n- **New**: a thing\n  that wraps.\n\n### Fixed\n- A fix');
  });
  it('leaves out an entry that was there at the last release and was only edited (its commit hashes added)', () => {
    const was = file.filter((l) => l !== '- **New**: a thing' && l !== '  that wraps.').map((l) => (l === '- A fix' ? '- A fix (abc1234)' : l));
    // Since then: "New" was added, "Old thing" reworded, and "A fix" got another hash (only an edit).
    const now = file.map((l) => (l === '- A fix' ? '- A fix (abc1234, 0f0f0f0)' : l === '- Old thing' ? '- Old thing, reworded' : l));
    expect(addedEntries(now, new Set([6, 7, 8, 11]), was).map((e) => e.text)).toEqual(['- **New**: a thing\n  that wraps.', '- Old thing, reworded']);
  });
});
