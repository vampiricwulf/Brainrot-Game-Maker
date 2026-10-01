// The standings as one line of text, for chat or Discord (📋 Copy results at the end, 📋 Copy standings from 📊 Scores).
import { toast } from '../lib/app.svelte';
import { formatPoints, type Game, type Session } from '../lib/model';
import { places, tiedLeaders } from '../lib/session';

/** "🏆 Brainrot Night: 🥇 Sam $4,200 · 🥈 Alex $3,100 · 🥉 Jo $0". Tied players share a place and a medal. */
export function standingsText(game: Game, session: Session): string {
  const medals = ['🥇', '🥈', '🥉'];
  const sym = game.settings.currencySymbol;
  const ranked = places(session).map((r) => `${medals[r.place - 1] ?? `${r.place}.`} ${r.player.name} ${formatPoints(r.score, sym)}`);
  const co = session.coWinners && tiedLeaders(session).length ? ' (co-winners)' : '';
  return `🏆 ${game.title}${co}: ${ranked.join(' · ')}`;
}

/** Put text on the clipboard, then say so (`done`) or that it couldn't. */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No async clipboard (older browsers, some file:// pages): fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) return toast("Couldn't copy that");
  }
  toast(done);
}
