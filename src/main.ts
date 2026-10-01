import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';
import AudienceApp from './audience/AudienceApp.svelte';
import { AUDIENCE_HASH, SCORES_HASH } from './lib/sync.svelte';
import { embeddedPack, unreadablePack } from './lib/export';

const target = document.getElementById('app')!;
// (It says "Loading…" until the app starts.)
target.replaceChildren();
export default location.hash === AUDIENCE_HASH || location.hash === SCORES_HASH
  ? mount(AudienceApp, { target, props: { scores: location.hash === SCORES_HASH } })
  : mount(App, { target, props: { embedded: embeddedPack(), packError: unreadablePack() } });
