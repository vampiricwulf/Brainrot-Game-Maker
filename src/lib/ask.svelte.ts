// In-app questions and messages instead of the browser's confirm() and alert() (AskDialog, shown by App): they look
// like the app, start with the focus on the safe answer, and never freeze the page (a stream capture keeps running).

export interface Ask {
  text: string;
  /** Its title (the question itself); left out, it's the text's question, or its first sentence. */
  title?: string;
  /** The answer button ('OK' for a message). */
  ok: string;
  /** The keep-things-as-they-are button; none for a message. */
  cancel?: string;
  /** The answer can't easily be taken back: a red button. */
  danger?: boolean;
  answer: (yes: boolean) => void;
}

/** What's waiting for an answer, oldest first (one shows at a time). */
export const asks = $state<Ask[]>([]);

/**
 * Asks a yes/no question: true for `ok`, false for `cancel` (also Esc and the ✕). `until`: once that's settled, the
 * question goes away by itself, answered false (it no longer matters).
 */
export function ask(
  text: string,
  opts: { title?: string; ok?: string; cancel?: string; danger?: boolean; until?: Promise<unknown> } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const a: Ask = { text, title: opts.title, ok: opts.ok ?? 'OK', cancel: opts.cancel ?? 'Cancel', danger: opts.danger, answer: resolve };
    asks.push(a);
    opts.until?.finally(() => {
      const i = asks.indexOf(a);
      if (i < 0) return;
      asks.splice(i, 1);
      resolve(false);
    });
  });
}

/** Shows a message until it's closed (for what a toast is too short for: errors, lists of missing files). */
export function tell(text: string): Promise<void> {
  return new Promise((resolve) => {
    asks.push({ text, ok: 'OK', answer: () => resolve() });
  });
}

/**
 * A question's title and the rest of its text: the given title, else its first sentence that asks something ("Forget
 * “Quiz”?", "Export anyway?"), else its first sentence or line.
 */
export function splitAsk(a: Pick<Ask, 'text' | 'title'>): { title: string; body: string } {
  const text = a.text.trim();
  if (a.title) return { title: a.title, body: text };
  // Its sentences (each ends at . ? or !, a closing quote may follow, before a space) and line breaks.
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      parts.push(text.slice(start, i), '\n');
      start = i + 1;
    } else if ('.?!'.includes(text[i])) {
      let j = i + 1;
      while (j < text.length && '”"’)'.includes(text[j])) j++;
      if (j < text.length && !/\s/.test(text[j])) continue;
      parts.push(text.slice(start, j));
      start = i = j;
      i--;
    }
  }
  parts.push(text.slice(start));
  let at = parts.findIndex((p) => /\?[”"’)]*$/.test(p.trim()));
  if (at < 0) at = parts.findIndex((p) => p.trim());
  const body = [...parts.slice(0, at), ...parts.slice(at + 1)]
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: parts[at].trim(), body };
}

/** Answers the question showing now. */
export function answer(yes: boolean): void {
  const a = asks.shift();
  a?.answer(yes);
}
