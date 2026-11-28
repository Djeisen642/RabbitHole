// The bunny's named poses: the everyday ones and the head peeking out of
// the hole after a dive. A pose is a set of numbers over REST (see shape.ts).
import { at, lerp, REST } from './shape';
import type { Pose, Vec } from './shape';
import type { Spot, Hole } from './thread';

export const POSES = {
  rest: {},
  perk: {
    earB: 22,
    earF: 18,
    earLen: 1.07,
    headDy: -5,
    headRot: -4,
    sy: 1.04,
    sx: 0.98,
  },
  droop: {
    earB: -30,
    earF: -38,
    earLen: 0.94,
    headDy: 6,
    headRot: 12,
    sy: 0.95,
    sx: 1.03,
  },
  crouch: { sy: 0.86, sx: 1.07, earB: -12, earF: -12, headDy: 3 },
  // Hind foot up at the back ear, head tipped down to meet it.
  scratch: { kick: 1, headRot: 12, headDy: 6, earB: -6, sy: 0.97 },
} satisfies Record<string, Partial<Pose>>;

// The two ends of a scratching stroke, laid over POSES.scratch: the toe rakes
// down the ear base and back up, and the ear bobs with it.
export const SCRATCH_STROKE = {
  up: { kick: 0.92, foot: 9, earB: 5 },
  down: { kick: 1, foot: -7, earB: -16 },
} satisfies Record<string, Partial<Pose>>;

// The head peeking out of the hole after the dive. The bunny stands in the
// shaft with its neck stretched, sunk so the ground cuts it just under the
// chin, where it is narrow enough to fit the opening.
export const PEEK: Partial<Pose> = { headDy: -12, earB: -4, earF: 6 };
const PEEK_CUT = 90; // height on the bunny where the ground cuts it
const PEEK_HIDE = 120; // how far down it sinks to be out of sight
// [cut height, middle of the bunny there] while rising, read off the outline.
const PEEK_MIDS: readonly Vec[] = [
  [96, 10],
  [100, 12],
  [104, 14],
  [108, 17],
  [112, 20],
  [116, 22],
  [120, 24],
  [140, 20],
  [144, 16],
  [148, 12],
  [152, 8],
  [156, 6],
];
const smooth = (t: number): number => t * t * (3 - 2 * t);

function peekMid(cut: number): number {
  const m = PEEK_MIDS;
  const first = at(m, 0);
  if (cut <= first[0]) return first[1];
  for (let i = 1; i < m.length; i += 1) {
    const hi = at(m, i);
    if (cut <= hi[0]) {
      const lo = at(m, i - 1);
      const t = (cut - lo[0]) / (hi[0] - lo[0]);
      return lerp(lo[1], hi[1], smooth(t));
    }
  }
  return at(m, -1)[1];
}

// The peek pose `up` of the way out of the hole (0 hidden, 1 peeking),
// centred on the hole. turn is 1 or -1 (which way it looks).
export function peekPose(
  spot: Spot,
  hole: Hole,
  ground: number,
  up = 1,
  turn = 1,
  extra: Partial<Pose> = {}
): Pose {
  const cut = PEEK_CUT + PEEK_HIDE * (1 - up);
  const sx = 0.9 + 0.1 * smooth(Math.max(0, Math.min(1, (110 - cut) / 14)));
  return {
    ...REST,
    ...PEEK,
    ...extra,
    turn,
    sx,
    x: hole.cx - spot.x - peekMid(cut) * sx * spot.facing * turn,
    y: hole.cy - ground + cut,
  };
}

// The slow, careful rise: up to the eyes, a wary pause, then the rest.
export const PEEK_EYES = 1 - 28 / PEEK_HIDE;
