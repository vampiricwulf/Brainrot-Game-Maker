// A ✍ clue's multiple choices in play: the ones phones get, their letters, which is right, what a player's answer
// picked, how many picked each, and who ✔ Judge all marks right or wrong. Pure: unit-tested in choices.test.ts.
//
// Every letter counts places in usableChoices(), never in the clue's own list: phones, the host's rows and counts,
// "✔ Judge all: B is right" and a typed "b" all agree, and a choice the buzzer room would drop (no words) is never shown.
import { CHOICE_ID_MAX, CHOICE_MAX, CHOICES_MAX, cleanName } from './buzzproto';
import type { Choice, Id } from './model';

/** A choice as phones get it: its words as the room keeps them (cleanName). */
export interface UsableChoice {
  id: Id;
  text: string;
  right?: true;
}

/** The letter of the choice at place `i`: A, B, C… */
export const letter = (i: number): string => String.fromCharCode(65 + i);

/**
 * The choices the room keeps, in order: words left after cleanName (no invisible characters, at most CHOICE_MAX) and an
 * id of CHOICE_ID_MAX characters at most (each once), CHOICES_MAX at most. Fewer than 2 is no multiple choice: none.
 */
export function usableChoices(list: readonly Choice[] | undefined): UsableChoice[] {
  const out: UsableChoice[] = [];
  for (const c of list ?? []) {
    if (out.length >= CHOICES_MAX) break;
    const text = typeof c.text === 'string' ? cleanName(c.text, CHOICE_MAX) : '';
    if (!text || typeof c.id !== 'string' || !c.id || c.id.length > CHOICE_ID_MAX || out.some((o) => o.id === c.id)) continue;
    out.push({ id: c.id, text, ...(c.right ? { right: true as const } : {}) });
  }
  return out.length >= 2 ? out : [];
}

/** The one marked ✔ Right, among the usable ones (one marked with no words counts as none). */
export const rightChoice = (usable: readonly UsableChoice[]): UsableChoice | undefined => usable.find((c) => c.right);

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The choice typed words name (from a phone that shows no buttons): a letter alone or in brackets ("b", "B)", "(b)"), a
 * letter then a sign and words ("b. stockholm"), or the words of exactly one choice. Null for anything else.
 */
export function matchChoice(text: string, usable: readonly UsableChoice[]): Id | null {
  const t = flat(text);
  const m = /^[([]?([a-z])(?:$|[)\].:-])/.exec(t);
  const at = m ? m[1].charCodeAt(0) - 97 : -1;
  if (at >= 0 && at < usable.length) return usable[at].id;
  const same = usable.filter((c) => flat(c.text) === t);
  return same.length === 1 ? same[0].id : null;
}

/** What an answer picked: the choice it was sent as (if it's still one), else the one its words name, else null. */
export function pickOf(answer: { text: string; pick?: Id }, usable: readonly UsableChoice[]): Id | null {
  if (answer.pick && usable.some((c) => c.id === answer.pick)) return answer.pick;
  return matchChoice(answer.text, usable);
}

/** "B · Stockholm"; undefined when it isn't one of them (deleted in play, say). */
export function pickLabel(usable: readonly UsableChoice[], id: Id | null | undefined): string | undefined {
  const i = id ? usable.findIndex((c) => c.id === id) : -1;
  return i < 0 ? undefined : `${letter(i)} · ${usable[i].text}`;
}

/** How many of `players` picked each choice (by place), and how many answered something that names none (`other`). */
export function choiceCounts(players: readonly Id[], answers: Readonly<Record<Id, { text: string; pick?: Id }>>, usable: readonly UsableChoice[]): { counts: number[]; other: number } {
  const counts = usable.map(() => 0);
  let other = 0;
  for (const id of players) {
    const a = answers[id];
    if (!a) continue;
    const i = usable.findIndex((c) => c.id === pickOf(a, usable));
    if (i < 0) other++;
    else counts[i]++;
  }
  return { counts, other };
}

/** "A 1 · B 2 · C 0 · D 0", with " · other 1" when some answers name no choice. */
export function countsLine(c: { counts: number[]; other: number }): string {
  return [...c.counts.map((n, i) => `${letter(i)} ${n}`), ...(c.other ? [`other ${c.other}`] : [])].join(' · ');
}

/**
 * Who ✔ Judge all marks, of `players` not judged yet (`judged`): right, those whose answer picked the choice marked
 * ✔ Right; wrong, those who picked another. Nobody without an answer, or with words that name no choice. With no
 * choice marked right: nobody.
 */
export function judgeAllPlan(
  players: readonly Id[],
  answers: Readonly<Record<Id, { text: string; pick?: Id }>>,
  usable: readonly UsableChoice[],
  judged: Readonly<Record<Id, unknown>> = {},
): { right: Id[]; wrong: Id[] } {
  const ok = rightChoice(usable);
  const out = { right: [] as Id[], wrong: [] as Id[] };
  if (!ok) return out;
  for (const id of players) {
    const a = answers[id];
    if (!a || judged[id] !== undefined) continue;
    const pick = pickOf(a, usable);
    if (pick === ok.id) out.right.push(id);
    else if (pick) out.wrong.push(id);
  }
  return out;
}
