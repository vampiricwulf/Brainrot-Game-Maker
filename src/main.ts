import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';
import AudienceApp from './audience/AudienceApp.svelte';
import { AUDIENCE_HASH } from './lib/sync.svelte';
import { embeddedPack } from './lib/export';

const target = document.getElementById('app')!;
export default location.hash === AUDIENCE_HASH
  ? mount(AudienceApp, { target })
  : mount(App, { target, props: { embedded: embeddedPack() } });
