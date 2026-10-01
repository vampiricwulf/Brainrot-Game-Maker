/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The phone buzzers' server (a Cloudflare Worker, see buzzer/), e.g. https://buzz.example.workers.dev. CI passes it in. */
  readonly VITE_BUZZER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
