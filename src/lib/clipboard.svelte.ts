// In-app clipboard for slide elements and whole slides (works across slides and clues).
import type { Slide, SlideElement } from './model';

export const clipboard = $state<{ elements: SlideElement[]; slide: Slide | null }>({ elements: [], slide: null });
