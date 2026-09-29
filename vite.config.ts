/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { buildInfo } from './scripts/build-info.mjs';

// Shown in ℹ About: the version, and which commit and day this file was built from.
const build = buildInfo();

export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(build.version),
    __BUILD_COMMIT__: JSON.stringify(build.commit),
    __BUILD_DATE__: JSON.stringify(build.date),
  },
  build: { outDir: 'dist', assetsInlineLimit: 100_000_000 },
  test: { include: ['src/**/*.test.ts'] },
});
