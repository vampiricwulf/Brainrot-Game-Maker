// Plain JSON save/open. The .jbr zip pack with media arrives in milestone M2.
import type { Game } from './model';

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string): string {
  return (title.trim() || 'game').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'game';
}

export function saveGameJson(game: Game): void {
  downloadText(`${safeFilename(game.title)}.json`, JSON.stringify(game, null, 2));
}

export function parseGame(text: string): Game {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !Array.isArray(data.rounds) || !Array.isArray(data.players)) {
    throw new Error('This file is not a Jeopardy Builder game.');
  }
  return data as Game;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
