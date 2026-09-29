// In-app clipboard for slide elements and whole slides (works across slides and clues).
import type { Slide, SlideElement } from './model';

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, token: '', text: '' });
