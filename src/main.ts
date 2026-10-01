import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';
import AudienceApp from './audience/AudienceApp.svelte';
import { AUDIENCE_HASH, SCORES_HASH } from './lib/sync.svelte';
import { embeddedPack } from './lib/export';
import { liveRegion } from './lib/announce';

const target = document.getElementById('app')!;
// (It says "Loading…" until the app starts.)
target.replaceChildren();
// The screen readers' live region is on the page from the start (see announce.ts).
liveRegion();
export default location.hash === AUDIENCE_HASH || location.hash === SCORES_HASH
  ? mount(AudienceApp, { target, props: { scores: location.hash === SCORES_HASH } })
  : mount(App, { target, props: { embedded: embeddedPack() } });
