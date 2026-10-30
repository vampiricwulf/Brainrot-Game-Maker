import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';
import AudienceApp from './audience/AudienceApp.svelte';
import CardWindow from './audience/CardWindow.svelte';
import { AUDIENCE_HASH, CARDS_HASH, SCORES_HASH } from './lib/sync.svelte';
import { embeddedPack, unreadablePack } from './lib/export';
import { liveRegion } from './lib/announce';
import { noBrowserMenu } from './lib/nomenu';

const target = document.getElementById('app')!;
// (It says "Loading…" until the app starts.)
target.replaceChildren();
// The screen readers' live region is on the page from the start (see announce.ts).
liveRegion();
// No browser right-click menu where the app has none, in every window (nomenu.ts).
noBrowserMenu();
export default location.hash === AUDIENCE_HASH || location.hash === SCORES_HASH
  ? mount(AudienceApp, { target, props: { scores: location.hash === SCORES_HASH } })
  : // 🪟 One player's 🤫 cards, from the host page that opened it (cardwindow.svelte.ts).
    location.hash === CARDS_HASH
    ? mount(CardWindow, { target })
    : mount(App, { target, props: { embedded: embeddedPack(), packError: unreadablePack() } });
