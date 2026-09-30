// Tests of runes code (*.svelte.test.ts) run in Node, but with Svelte compiled for the browser, so their effects run
// as they do in the app (compiled for the server, effects never run).
import type { Environment } from 'vitest/runtime';

export default { name: 'svelte-client', viteEnvironment: 'client', setup: () => ({ teardown() {} }) } satisfies Environment;
