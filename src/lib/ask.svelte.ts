// In-app questions and messages instead of the browser's confirm() and alert() (AskDialog, shown by App): they look
// like the app, start with the focus on the safe answer, and never freeze the page (a stream capture keeps running).

export interface Ask {
  text: string;
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

/** Asks a yes/no question: true for `ok`, false for `cancel` (also Esc and the ✕). */
export function ask(text: string, opts: { ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    asks.push({ text, ok: opts.ok ?? 'OK', cancel: opts.cancel ?? 'Cancel', danger: opts.danger, answer: resolve });
  });
}

/** Shows a message until it's closed (for what a toast is too short for: errors, lists of missing files). */
export function tell(text: string): Promise<void> {
  return new Promise((resolve) => {
    asks.push({ text, ok: 'OK', answer: () => resolve() });
  });
}

/** Answers the question showing now. */
export function answer(yes: boolean): void {
  const a = asks.shift();
  a?.answer(yes);
}
