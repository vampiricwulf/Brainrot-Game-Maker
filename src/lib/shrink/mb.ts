// The one module that imports mediabunny (MPL-2.0, github.com/Vanilagy/mediabunny), naming only what 🗜 uses. Everything
// else loads it with `await import('./mb')` (and imports its types with `import type`), so it's read only when a copy
// is first made.
export { CanvasSource, canEncodeAudio, canEncodeVideo, Mp4OutputFormat, Output, Quality, StreamTarget, WebMOutputFormat } from 'mediabunny';
