// In-app clipboard for slide elements, whole slides, RPG screens and sets of buttons (works across slides, clues, maps
// and games).
import type { Action, MediaRef, Screen, Slide, SlideElement } from './model';

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** An RPG screen, with its looks, music and notes. */
  screen: Screen | null;
  /** Buttons (actions) of an object, item, space or wheel slice. */
  actions: Action[];
  /** The files the copied items, slide, screen and buttons show, so they paste into another game with them (see pruneMedia). */
  media: MediaRef[];
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, screen: null, actions: [], media: [], token: '', text: '' });

/** The files of `refs` that something copied shows (pictures, sounds, music, fonts: anywhere in it). */
export function mediaShownBy(x: unknown, refs: readonly MediaRef[]): MediaRef[] {
  const json = JSON.stringify(x ?? null);
  return refs.filter((m, i) => json.includes(m.id) && refs.findIndex((r) => r.id === m.id) === i);
}
