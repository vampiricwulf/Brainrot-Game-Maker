// Lint over every component: Svelte drops the spaces at the start and end of an element's or a block's contents, so
// `More rules{#if x}<span> · {what}</span>{/if}` shows "More rules· …" and `Off{#if v} <span>(keeps …)</span>{/if}`
// shows "Off(keeps …)". A space meant to be seen there is written {' '}, which Svelte keeps.
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';

/** Every component's source, by its path. */
const sources = import.meta.glob<string>('/src/**/*.svelte', { query: '?raw', import: 'default', eager: true });

type Node = { type: string; name?: string; data?: string; start: number; nodes?: Node[]; [k: string]: unknown };

/** Elements whose spaces the browser keeps as written. */
const KEEPS = new Set(['pre', 'textarea']);

/** Each place in a component where a space on the line would be dropped: "path:line". */
function droppedSpaces(path: string, src: string): string[] {
  const out: string[] = [];
  const line = (at: number) => src.slice(0, at).split('\n').length;
  const isKbd = (n: Node | undefined) => n?.type === 'RegularElement' && n.name === 'kbd';
  const look = (nodes: Node[]) => {
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    // (A space before a key cap is drawn by the cap's own margin.)
    if (first.type === 'Text' && (/^[ \t]+\S/.test(first.data ?? '') || (/^[ \t]+$/.test(first.data ?? '') && nodes.length > 1 && !isKbd(nodes[1]))))
      out.push(`${path}:${line(first.start)} starts with ${JSON.stringify(first.data)}`);
    if (last.type === 'Text' && nodes.length > 0 && (/\S[ \t]+$/.test(last.data ?? '') || (/^[ \t]+$/.test(last.data ?? '') && nodes.length > 1)))
      out.push(`${path}:${line(last.start)} ends with ${JSON.stringify(last.data)}`);
  };
  const walk = (node: unknown, owner: string) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, owner));
    const n = node as Node;
    if (n.type === 'Fragment') {
      if (owner !== 'root' && !KEEPS.has(owner)) look(n.nodes ?? []);
      return (n.nodes ?? []).forEach((c) => walk(c, owner));
    }
    const me = n.type === 'RegularElement' ? (n.name ?? '') : n.type;
    for (const [k, v] of Object.entries(n)) if (!['parent', 'metadata', 'expression', 'attributes'].includes(k) && v && typeof v === 'object') walk(v, me);
  };
  walk(parse(src, { modern: true }).fragment, 'root');
  return out;
}

describe('spaces in what the app shows', () => {
  it('none is written where Svelte drops it (use {\' \'})', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const bad = Object.entries(sources).flatMap(([f, src]) => droppedSpaces(f, src));
    expect(bad).toEqual([]);
  });

  it('finds the kinds it is for', () => {
    expect(droppedSpaces('a', '<button>More{#if x}<span class="m"> · {y}</span>{/if}</button>')).toHaveLength(1);
    expect(droppedSpaces('b', '<span>Off{#if v} <span>(keeps)</span>{/if}</span>')).toHaveLength(1);
    expect(droppedSpaces('c', '<p>{#if v}<b>{n}</b> rolled {/if}</p>')).toHaveLength(1);
    expect(droppedSpaces('d', '<span class="m">{\' \'}· {y}</span>')).toEqual([]);
    expect(droppedSpaces('e', '<button>{label}{#if key} <kbd>{key}</kbd>{/if}</button>')).toEqual([]);
    expect(droppedSpaces('f', '<p>\n  Lines laid out\n  on their own\n</p>')).toEqual([]);
    expect(droppedSpaces('g', '<pre> kept </pre>')).toEqual([]);
  });
});
