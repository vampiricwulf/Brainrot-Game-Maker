// In-app clipboard for slide elements and whole slides (works across slides, clues and games).
import type { MediaRef, Slide, SlideElement } from './model';

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** The files the copied items and slide show, so they paste into another game with them (see pruneMedia). */
  media: MediaRef[];
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, media: [], token: '', text: '' });
