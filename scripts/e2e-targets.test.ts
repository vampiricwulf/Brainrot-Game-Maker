import { describe, expect, it } from 'vitest';
import { leftoversOf, parseTargets } from './e2e-targets.mjs';

const known = { all: ['deal', 'dealcopy', 'hostlayout', 'smoke'], shards: ['1', '2', '3', '4', '5'], notTests: new Set(['helpers', 'mediafixtures']) };

describe('parseTargets', () => {
  it('keeps the shard names and --check', () => {
    expect(parseTargets(['--check'], known)).toEqual({ check: true });
    for (const t of ['all', 'buzzer', 'rest', '3']) expect(parseTargets([t], known)).toEqual({ target: t });
  });
  it('takes file names in any of their three spellings, each once, in order', () => {
    expect(parseTargets(['smoke'], known)).toEqual({ files: ['smoke'] });
    expect(parseTargets(['hostlayout.mjs', 'tests/e2e/smoke.mjs', './tests/e2e/deal.mjs', 'smoke'], known)).toEqual({
      files: ['hostlayout', 'smoke', 'deal'],
    });
    expect(parseTargets(['tests\\e2e\\smoke.mjs'], known)).toEqual({ files: ['smoke'] });
  });
  it('refuses a name that is no e2e file, a shard among files, and nothing at all', () => {
    expect(parseTargets(['smok'], known)).toEqual({ error: 'not an e2e file: smok' });
    expect(parseTargets(['helpers'], { ...known, all: [...known.all, 'helpers'] })).toEqual({ error: 'not an e2e file: helpers' });
    expect(parseTargets(['smoke', '3'], known)).toEqual({ error: 'not an e2e file: 3' });
    expect(parseTargets(['--check', 'smoke'], known)).toEqual({ error: 'not an e2e file: --check' });
    expect(parseTargets([], known)).toEqual({ error: '' });
  });
});

describe('leftoversOf', () => {
  const names = [
    'deal-failure.png',
    'deal-host-failure.png',
    'deal-trace.zip',
    'dealcopy-failure.png',
    'deal-export.json',
    'deal.png',
    'smoke-failure.png',
    'screenshots',
  ];
  it("takes only that file's own failure pictures and trace", () => {
    expect(leftoversOf('deal', names)).toEqual(['deal-failure.png', 'deal-host-failure.png', 'deal-trace.zip']);
    expect(leftoversOf('dealcopy', names)).toEqual(['dealcopy-failure.png']);
    expect(leftoversOf('hostlayout', names)).toEqual([]);
  });
});
