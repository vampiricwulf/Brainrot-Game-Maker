// In-app clipboard for slide elements, whole slides and RPG screens (works across slides, clues, maps and games).
import type { MediaRef, Screen, Slide, SlideElement } from './model';

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** An RPG screen, with its looks, music and notes. */
  screen: Screen | null;
  /** The files the copied items, slide and screen show, so they paste into another game with them (see pruneMedia). */
  media: MediaRef[];
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, screen: null, media: [], token: '', text: '' });

/** The files of `refs` that something copied shows (pictures, sounds, music, fonts: anywhere in it). */
export function mediaShownBy(x: unknown, refs: readonly MediaRef[]): MediaRef[] {
  const json = JSON.stringify(x ?? null);
  return refs.filter((m, i) => json.includes(m.id) && refs.findIndex((r) => r.id === m.id) === i);
}
