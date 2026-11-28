// The bunny's moves: their names, timings and easing, and the behaviour
// rules that pick and gate them, kept pure so they can be tested without a
// DOM.

// The dive is quick, it's a reward: a fixed time for each half.
export const DIVE_MS = { pour: 760, climb: 820 };
export const PEEK_MS = { eyes: 550, wary: 180, rise: 320, duck: 150 };

export const ease = {
  linear: (t: number) => t,
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  // Gentler curves for sliding the loose line, so it never whips past.
  glide: (t: number) => (1 - Math.cos(Math.PI * t)) / 2,
  glideIn: (t: number) => 1 - Math.cos((Math.PI * t) / 2),
  glideOut: (t: number) => Math.sin((Math.PI * t) / 2),
  // Quick but not abrupt: for the dive's pour and climb.
  snapIn: (t: number) => t * (0.4 + 0.6 * t),
  snapOut: (t: number) => 1 - (1 - t) ** 2 * (1.6 - 0.6 * (1 - t)),
  back: (t: number) => {
    const c = 1.7;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};
export type EaseName = keyof typeof ease;

export type MoveName =
  | 'twitch'
  | 'thump'
  | 'scratch'
  | 'perk'
  | 'droop'
  | 'travel'
  | 'dive'
  | 'climb';

/** Idle for this long and the bunny starts thumping. */
export const QUIET_MS = 15000;
/** Share of idle beats that are an ear scratch instead of a twitch. */
export const SCRATCH_CHANCE = 0.18;

/** Which idle move to play, given how long things have been quiet and a
 * random roll in [0, 1). Scratches are occasional, twitches the norm. */
export function idleMove(
  quietFor: number,
  roll: number
): 'thump' | 'scratch' | 'twitch' {
  if (quietFor > QUIET_MS) return 'thump';
  return roll < SCRATCH_CHANCE ? 'scratch' : 'twitch';
}

/** After a pet finishes, further taps are ignored for this long so that
 * repeated tapping can't spam the animation. */
export const PET_COOLDOWN_MS = 4000;

/** Whether a tap at `now` pets the bunny. `readyAt` is when the last pet's
 * cooldown ends; a tap mid-animation (`busy`) never counts. */
export function canPet(now: number, readyAt: number, busy: boolean): boolean {
  return !busy && now >= readyAt;
}

/** Whether a move plays from where the bunny is. Once it has dived it stays
 * in the hole: only climbing brings it out, and nothing else plays there
 * (petting has its own in-hole peek). */
export function movePlays(name: MoveName, inHole: boolean): boolean {
  return inHole ? name === 'climb' : name !== 'climb';
}

/** Whether the bunny is in the hole after a move. */
export function inHoleAfter(name: MoveName, inHole: boolean): boolean {
  if (name === 'dive') return true;
  if (name === 'climb') return false;
  return inHole;
}
