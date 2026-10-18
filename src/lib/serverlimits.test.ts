import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILE_LIMITS, OLD_FILE_LIMITS } from './buzzproto';
import { prefs } from './prefs.svelte';
import { remote, testServer } from './remote.svelte';
import { ASK_AGAIN_MS, askServerFiles, fileLimitsNow, forgetServerFiles, healthFiles, noteServerFiles } from './serverlimits.svelte';

const MB = 1024 * 1024;
const LIMITS = { fileBytes: 24 * MB, roomBytes: 60 * MB, roomFiles: 32 };
/** Lets the page's promises run (a fetch's answer and what's done with it). */
const settle = () => new Promise((ok) => setTimeout(ok, 0));

let was = '';
beforeEach(() => {
  was = prefs.buzzerServer;
  forgetServerFiles();
});
afterEach(() => {
  prefs.buzzerServer = was;
  Object.assign(remote, { status: 'off', base: '', features: [], welcomed: false, limits: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('what a buzzer server says about card files', () => {
  it('its /api/health answer: its limits, none (it takes no files), or nothing (an older server)', () => {
    expect(healthFiles({ ok: true, protocol: 1, files: LIMITS })).toEqual({ files: LIMITS });
    expect(healthFiles({ ok: true, protocol: 1, files: null })).toBe('off');
    expect(healthFiles({ ok: true, protocol: 1 })).toBe('old');
    // (Limits that don't add up: as an older server's.)
    expect(healthFiles({ ok: true, protocol: 1, files: { ...LIMITS, fileBytes: 61 * MB } })).toBe('old');
    expect(healthFiles({ ok: true, protocol: 1, files: 'lots' })).toBe('old');
    for (const bad of [null, 'ok', 7, {}, { ok: false, files: LIMITS }, { ok: 'yes' }]) expect(healthFiles(bad), JSON.stringify(bad)).toBeNull();
  });

  it('asks each server once while the page is open; one that didn’t answer is asked again only after a while', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const asked: string[] = [];
    let answer: () => Promise<Response> = async () => Response.json({ ok: true, protocol: 1, files: LIMITS });
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return answer();
    });
    prefs.buzzerServer = 'https://a.test';
    expect(fileLimitsNow()).toEqual({ limits: DEFAULT_FILE_LIMITS, known: false, off: false, old: false, gifs: true });
    askServerFiles('https://a.test');
    // (Not again while the answer is on its way.)
    askServerFiles('a.test/');
    await settle();
    expect(asked).toEqual(['https://a.test/api/health']);
    expect(fileLimitsNow()).toEqual({ limits: LIMITS, known: true, off: false, old: false, gifs: true });
    askServerFiles('https://a.test');
    await settle();
    expect(asked).toHaveLength(1);
    // Each address its own; no answer is no matter, and it's asked again a minute on.
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    askServerFiles('https://b.test');
    await settle();
    askServerFiles('https://b.test');
    await settle();
    expect(asked).toEqual(['https://a.test/api/health', 'https://b.test/api/health']);
    prefs.buzzerServer = 'https://b.test';
    expect(fileLimitsNow().known).toBe(false);
    vi.setSystemTime(Date.now() + ASK_AGAIN_MS - 1);
    askServerFiles('https://b.test');
    await settle();
    expect(asked).toHaveLength(2);
    vi.setSystemTime(Date.now() + 1);
    // (Not a buzzer server's answer counts as none too.)
    answer = async () => new Response('nope', { status: 404 });
    askServerFiles('https://b.test');
    await settle();
    expect(asked).toHaveLength(3);
    vi.setSystemTime(Date.now() + ASK_AGAIN_MS);
    answer = async () => Response.json({ ok: true, protocol: 1 });
    askServerFiles('https://b.test');
    await settle();
    expect(asked).toHaveLength(4);
    expect(fileLimitsNow()).toEqual({ limits: OLD_FILE_LIMITS, known: true, off: false, old: true, gifs: true });
    // An address that isn't one is never asked.
    askServerFiles('');
    askServerFiles('ftp://c.test');
    expect(asked).toHaveLength(4);
  });

  it('goes by this window’s room on the server in use first, then what that server said, then the defaults', () => {
    prefs.buzzerServer = '';
    expect(fileLimitsNow()).toEqual({ limits: DEFAULT_FILE_LIMITS, known: false, off: false, old: false, gifs: true });
    prefs.buzzerServer = 'https://a.test';
    expect(fileLimitsNow()).toEqual({ limits: DEFAULT_FILE_LIMITS, known: false, off: false, old: false, gifs: true });
    noteServerFiles('https://a.test', 'old');
    expect(fileLimitsNow()).toEqual({ limits: OLD_FILE_LIMITS, known: true, off: false, old: true, gifs: true });
    noteServerFiles('https://a.test/', 'off');
    expect(fileLimitsNow()).toMatchObject({ known: true, off: true });
    noteServerFiles('https://a.test', { files: LIMITS });
    expect(fileLimitsNow()).toEqual({ limits: LIMITS, known: true, off: false, old: false, gifs: true });
    // (Another server's word is its own.)
    noteServerFiles('https://b.test', { files: { ...LIMITS, fileBytes: 2 * MB } });
    expect(fileLimitsNow().limits).toEqual(LIMITS);
    // A room open on it: its welcome says (none: an older server's).
    const limits = { ...LIMITS, fileBytes: 6 * MB };
    Object.assign(remote, { status: 'online', base: 'https://a.test', features: ['cards', 'files', 'gifs'], welcomed: true, limits });
    expect(fileLimitsNow()).toEqual({ limits, known: true, off: false, old: false, gifs: true });
    // (An older room doesn't show a GIF's video copy like a GIF.)
    remote.features = ['cards', 'files'];
    remote.limits = null;
    expect(fileLimitsNow()).toEqual({ limits: OLD_FILE_LIMITS, known: true, off: false, old: true, gifs: false });
    // One that puts cards on phones but takes no files now.
    remote.features = ['cards'];
    expect(fileLimitsNow()).toMatchObject({ known: true, off: true });
    // Not reached now, or on another server than the one in use: what the server in use said.
    remote.status = 'reconnecting';
    expect(fileLimitsNow().limits).toEqual(LIMITS);
    Object.assign(remote, { status: 'online', base: 'https://b.test' });
    expect(fileLimitsNow().limits).toEqual(LIMITS);
  });

  it('⚙ Settings › Test says what card files the server takes, and notes it', async () => {
    let body: unknown = { ok: true, protocol: 1, files: LIMITS };
    vi.stubGlobal('fetch', async () => Response.json(body));
    expect(await testServer('https://a.test')).toBe('✔ The buzzer server is answering: card files up to 24 MB each, 60 MB a room');
    prefs.buzzerServer = 'https://a.test';
    expect(fileLimitsNow().limits).toEqual(LIMITS);
    body = { ok: true, protocol: 1, files: null };
    expect(await testServer('https://a.test')).toBe('✔ The buzzer server is answering (it takes no card files)');
    expect(fileLimitsNow().off).toBe(true);
    body = { ok: true, protocol: 1 };
    expect(await testServer('https://a.test')).toBe('✔ The buzzer server is answering (an older one: card files up to 16 MB)');
    expect(fileLimitsNow().limits).toEqual(OLD_FILE_LIMITS);
  });
});
