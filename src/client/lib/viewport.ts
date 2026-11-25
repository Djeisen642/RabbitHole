/**
 * Keeps the game shell inside the part of the screen the player can see.
 *
 * On a phone the on-screen keyboard shrinks only the *visual* viewport: the
 * layout viewport (what `100dvh` and `position: fixed` measure against) stays
 * full height, so a fixed, full-height shell would put the guess box and the
 * header under the keyboard, and iOS also pans the page to reach the input,
 * which can push the header (and the bunny) off the top. The visual viewport
 * API reports the visible box, so we copy its height and top offset into CSS
 * variables that `.rh-app` sizes and positions itself with. Without the API
 * the CSS falls back to `100dvh`.
 */
export function trackVisualViewport(root: HTMLElement): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  const update = (): void => {
    root.style.setProperty('--vv-h', `${vv.height}px`);
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    root.style.removeProperty('--vv-h');
    root.style.removeProperty('--vv-top');
  };
}
