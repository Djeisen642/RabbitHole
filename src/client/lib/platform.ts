/**
 * The few places the game talks to Reddit's app shell. On Reddit these use
 * Devvit's client effects; in local mock mode (no `devvit` global) they fall
 * back to plain links so the whole loop can be played in a browser.
 */
import { navigateTo, requestExpandedMode, showToast } from '@devvit/web/client';

/** True inside Reddit's web view, false in local mock mode. */
export const onReddit: boolean = 'devvit' in globalThis;

/** Open the expanded game view from the inline splash. */
export function openGame(event: MouseEvent): boolean {
  if (!onReddit) return false;
  requestExpandedMode(event, 'game');
  return true;
}

/** Open a community on Reddit. */
export function visit(url: string): boolean {
  if (!onReddit) return false;
  navigateTo(url);
  return true;
}

export function toast(text: string): void {
  if (onReddit) showToast(text);
}
