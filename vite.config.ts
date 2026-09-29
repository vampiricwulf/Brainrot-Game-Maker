/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds everything (JS, CSS, assets) into one self-contained dist/index.html
// that works when opened straight from disk (file://).
export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100_000_000 },
  test: { include: ['src/**/*.test.ts'] },
});
