// What the e2e files' init scripts and page.evaluate() calls keep on the page's window: their own records and stand-ins
// (window.__seen, window.__room, …), named with two underscores so they never meet one of the app's own.
interface Window {
  [hook: `__${string}`]: any;
}
