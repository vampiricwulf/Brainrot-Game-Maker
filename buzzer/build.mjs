// Builds the phone page into one file: phone/index.html with phone/style.css and the bundled phone/main.ts inlined,
// written to dist/index.html (wrangler serves dist/). Run by wrangler before dev and deploy.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = await build({
  entryPoints: [join(here, 'phone/main.ts')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  logLevel: 'warning',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(here, 'phone/style.css'), 'utf8');
const html = readFileSync(join(here, 'phone/index.html'), 'utf8')
  .replace('/*STYLE*/', () => css)
  .replace('/*SCRIPT*/', () => js);
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/index.html'), html);
console.log(`phone page: dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
