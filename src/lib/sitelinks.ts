// Pages on the project's site, and opening them (the desktop app opens them in the browser).
import { toast } from './app.svelte';
import { openLink } from './desktop.svelte';
import { inTauri } from './platform';

export const REPO = 'https://github.com/vampiricwulf/Brainrot-Game-Maker';
/** The README's guide to running your own buzzer server on Cloudflare. */
export const BUZZER_GUIDE = `${REPO}#set-up-your-own-buzzer-server`;
/** The README's guide to hosting: phone buzzers, 🤫 cards, 🎭 deals, teams, the audience window. */
export const HOSTING_GUIDE = `${REPO}#hosting`;

/** Open one of the project's pages: in the desktop app in the browser, in a browser in a new tab. */
export function openSite(url: string): void {
  if (!inTauri()) return void window.open(url, '_blank', 'noreferrer');
  openLink(url).then((ok) => !ok && toast(`Couldn't open the browser: ${url}`));
}

/** A link's click: in the desktop app it opens in the browser (a web page opens it in a new tab by itself). */
export function externalLink(e: MouseEvent): void {
  if (!inTauri()) return;
  e.preventDefault();
  openSite((e.currentTarget as HTMLAnchorElement).href);
}
